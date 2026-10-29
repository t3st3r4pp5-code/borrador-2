/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/map.js
 * Módulo de Geolocalización de Antenas con Línea de Tiempo Interactiva y Scrubber
 * ============================================================================
 * 
 * CRITERIOS DE GEORREFERENCIACIÓN IMPLEMENTADOS:
 * - Número de conexiones a cierta antena (Frecuencia / Calor)
 * - Identificación de cuáles números se conectan a cierta antena
 * - Conexiones en ciertas fechas y rango horario del hecho
 * - Apertura y orientación de Azimut (Haz celular de 60°)
 * - Secuencia de antenas registradas paso a paso (la antena indica cobertura, no la ubicación de la persona)
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDateTime, getAzimuthCardinal, showToast, escapeHtml } from '../utils.js';

let leafletMap = null;
let markersLayer = null;
let trajectoryLayer = null;
let sectorsLayer = null;
let playbackMarker = null;

// Variables de la línea de tiempo interactiva
let timelineEvents = [];
let currentTimelineIndex = 0;
let isPlaying = false;
let playbackTimer = null;

const JUAREZ_CENTER = [31.6904, -106.4245];

export function initMapModule() {
  console.log('[Map] Inicializando módulo cartográfico con línea de tiempo interactiva...');

  document.getElementById('map-filter-operator')?.addEventListener('change', renderMap);
  document.getElementById('map-filter-phone')?.addEventListener('input', renderMap);
  document.getElementById('map-filter-antenna')?.addEventListener('change', renderMap);
  document.getElementById('map-filter-date')?.addEventListener('change', renderMap);
  document.getElementById('map-toggle-trajectory')?.addEventListener('change', renderMap);
  document.getElementById('map-toggle-sectors')?.addEventListener('change', renderMap);

  // Controles del Scrubber / Reproductor de Línea de Tiempo
  document.getElementById('timeline-slider')?.addEventListener('input', handleTimelineSliderChange);
  document.getElementById('btn-timeline-play')?.addEventListener('click', togglePlayback);
  document.getElementById('btn-timeline-prev')?.addEventListener('click', stepTimelineBack);
  document.getElementById('btn-timeline-next')?.addEventListener('click', stepTimelineForward);
  document.getElementById('btn-timeline-reset')?.addEventListener('click', resetTimelinePlayback);
}

export async function renderMap() {
  const mapContainer = document.getElementById('leaflet-map');
  if (!mapContainer || !window.L) return;

  if (!leafletMap) {
    leafletMap = window.L.map('leaflet-map', {
      zoomControl: true,
      attributionControl: true
    }).setView(JUAREZ_CENTER, 12);

    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO | UECS Cd. Juárez / Chih.',
      maxZoom: 19
    }).addTo(leafletMap);

    markersLayer = window.L.layerGroup().addTo(leafletMap);
    trajectoryLayer = window.L.layerGroup().addTo(leafletMap);
    sectorsLayer = window.L.layerGroup().addTo(leafletMap);
  }

  leafletMap.invalidateSize();

  // Limpiar capas
  markersLayer.clearLayers();
  trajectoryLayer.clearLayers();
  sectorsLayer.clearLayers();
  if (playbackMarker) {
    playbackMarker.remove();
    playbackMarker = null;
  }

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  const operatorFilter = document.getElementById('map-filter-operator')?.value || '';
  const phoneFilter = (document.getElementById('map-filter-phone')?.value || '').trim();
  const antennaFilter = document.getElementById('map-filter-antenna')?.value || '';
  const dateFilter = document.getElementById('map-filter-date')?.value || '';
  const showTrajectory = document.getElementById('map-toggle-trajectory')?.checked ?? true;
  const showSectors = document.getElementById('map-toggle-sectors')?.checked ?? true;

  // Llenar selector de antenas si está vacío
  populateMapAntennasSelect(allRecords);

  // Filtrar registros
  let filtered = allRecords.filter(r => r.latitude && r.longitude);

  if (operatorFilter) {
    filtered = filtered.filter(r => r.operator === operatorFilter);
  }

  if (phoneFilter) {
    filtered = filtered.filter(r => r.phone_origin.includes(phoneFilter) || r.phone_destination.includes(phoneFilter));
  }

  if (antennaFilter) {
    filtered = filtered.filter(r => r.cell_id === antennaFilter);
  }

  if (dateFilter) {
    filtered = filtered.filter(r => r.event_datetime && r.event_datetime.startsWith(dateFilter));
  }

  // Ordenar cronológicamente para la línea de tiempo interactiva
  timelineEvents = [...filtered].sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));

  // Inicializar o ajustar slider de línea de tiempo
  setupTimelineControls(timelineEvents);

  if (timelineEvents.length === 0) {
    showToast('No hay registros georreferenciados para los criterios seleccionados', 'info');
    return;
  }

  // 1. Agrupar por antena única para calcular número de conexiones y cuáles números se conectan
  const antennaGroups = {};
  timelineEvents.forEach(r => {
    const key = `${r.cell_id}_${r.latitude}_${r.longitude}`;
    if (!antennaGroups[key]) {
      antennaGroups[key] = {
        cell_id: r.cell_id,
        latitude: r.latitude,
        longitude: r.longitude,
        operator: r.operator,
        azimuth: r.azimuth,
        records: [],
        connectedPhones: new Set()
      };
    }
    antennaGroups[key].records.push(r);
    antennaGroups[key].connectedPhones.add(r.phone_origin);
    antennaGroups[key].connectedPhones.add(r.phone_destination);
  });

  const antennaPoints = [];

  // 2. Colocar marcadores con popups forenses enriquecidos
  Object.values(antennaGroups).forEach(ant => {
    const totalEvents = ant.records.length;
    const phoneList = Array.from(ant.connectedPhones).slice(0, 5).map(p => formatPhoneNumber(p)).join(', ');
    const moreCount = ant.connectedPhones.size > 5 ? ` (+${ant.connectedPhones.size - 5} más)` : '';

    const color = ant.operator === 'AT&T' ? '#009fdb' : ant.operator === 'Movistar' ? '#00a9e0' : '#002d62';
    const radius = Math.min(26, Math.max(9, Math.log2(totalEvents + 1) * 4.5));

    antennaPoints.push([ant.latitude, ant.longitude]);

    const marker = window.L.circleMarker([ant.latitude, ant.longitude], {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    });

    marker.bindPopup(`
      <div style="min-width: 250px; font-size: 12px; font-family: Arial, sans-serif;">
        <div style="font-weight: bold; color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 4px; margin-bottom: 6px;">
          📡 SITIO CELULAR: ${escapeHtml(ant.cell_id)}
        </div>
        <div><strong>Operador:</strong> <span class="badge bg-dark">${escapeHtml(ant.operator)}</span></div>
        <div><strong>Total Conexiones:</strong> <span class="badge bg-danger">${totalEvents} eventos</span></div>
        <div><strong>Números Conectados (${ant.connectedPhones.size}):</strong><br>
          <small class="text-muted font-monospace">${phoneList}${moreCount}</small>
        </div>
        <div><strong>Orientación Azimut:</strong> ${getAzimuthCardinal(ant.azimuth)}</div>
        <div><strong>Coordenadas:</strong> ${ant.latitude.toFixed(4)}, ${ant.longitude.toFixed(4)}</div>
      </div>
    `);

    markersLayer.addLayer(marker);

    // 3. Dibujar cuña de azimut si está activa
    if (showSectors && ant.azimuth !== undefined) {
      drawAzimuthSector(ant.latitude, ant.longitude, ant.azimuth, color);
    }
  });

  // 4. Si se especificó un número o ruta de interés, trazar trayectoria
  if (showTrajectory && timelineEvents.length > 1) {
    const pathCoords = timelineEvents.map(r => [r.latitude, r.longitude]);

    const polyline = window.L.polyline(pathCoords, {
      color: '#d32f2f',
      weight: 3.5,
      opacity: 0.85,
      dashArray: '6, 8'
    });

    trajectoryLayer.addLayer(polyline);

    // Marcadores inicio y fin
    const first = timelineEvents[0];
    const last = timelineEvents[timelineEvents.length - 1];

    const startIcon = window.L.divIcon({
      html: '<div style="background:#2e7d32;color:#fff;font-weight:bold;padding:2px 6px;border-radius:10px;font-size:10px;border:1px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);">PRIMER REGISTRO</div>',
      className: 'badge-start'
    });
    const endIcon = window.L.divIcon({
      html: '<div style="background:#d32f2f;color:#fff;font-weight:bold;padding:2px 6px;border-radius:10px;font-size:10px;border:1px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);">ÚLTIMA ANTENA REGISTRADA</div>',
      className: 'badge-end'
    });

    window.L.marker([first.latitude, first.longitude], { icon: startIcon }).addTo(trajectoryLayer);
    window.L.marker([last.latitude, last.longitude], { icon: endIcon }).addTo(trajectoryLayer);
  }

  // Ajustar vista
  if (antennaPoints.length > 0) {
    leafletMap.fitBounds(antennaPoints, { padding: [40, 40], maxZoom: 14 });
  }

  // Actualizar indicadores
  const countEl = document.getElementById('map-antennas-count');
  if (countEl) countEl.textContent = `${Object.keys(antennaGroups).length} antenas • ${timelineEvents.length} eventos`;
}

function populateMapAntennasSelect(records) {
  const select = document.getElementById('map-filter-antenna');
  if (!select || select.children.length > 1) return;

  const antennas = Array.from(new Set(records.map(r => r.cell_id).filter(Boolean)));
  select.innerHTML = '<option value="">Todas las Antenas</option>' + 
    antennas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
}

function drawAzimuthSector(lat, lng, azimuthDeg, color) {
  if (azimuthDeg === null || isNaN(azimuthDeg)) return;

  const radiusMeters = 850;
  const beamAngle = 60;
  const startAngle = (azimuthDeg - beamAngle / 2) * (Math.PI / 180);
  const endAngle = (azimuthDeg + beamAngle / 2) * (Math.PI / 180);

  const points = [[lat, lng]];

  for (let angle = startAngle; angle <= endAngle; angle += 0.1) {
    const dLat = (radiusMeters * Math.cos(angle)) / 111320;
    const dLng = (radiusMeters * Math.sin(angle)) / (40075000 * Math.cos(lat * (Math.PI / 180)) / 360);
    points.push([lat + dLat, lng + dLng]);
  }

  points.push([lat, lng]);

  const polygon = window.L.polygon(points, {
    color: color,
    weight: 1,
    fillColor: color,
    fillOpacity: 0.15
  });

  sectorsLayer.addLayer(polygon);
}

/**
 * ============================================================================
 * LÍNEA DE TIEMPO INTERACTIVA Y REPRODUCTOR PASO A PASO
 * ============================================================================
 */
function setupTimelineControls(events) {
  const slider = document.getElementById('timeline-slider');
  const countBadge = document.getElementById('timeline-total-steps');
  
  if (slider) {
    slider.max = Math.max(0, events.length - 1);
    slider.value = 0;
    currentTimelineIndex = 0;
  }

  if (countBadge) {
    countBadge.textContent = `${events.length} pasos`;
  }

  updateTimelineStatusDisplay();
}

function handleTimelineSliderChange(e) {
  currentTimelineIndex = parseInt(e.target.value, 10) || 0;
  highlightTimelineEvent(currentTimelineIndex);
}

function stepTimelineForward() {
  if (currentTimelineIndex < timelineEvents.length - 1) {
    currentTimelineIndex++;
    const slider = document.getElementById('timeline-slider');
    if (slider) slider.value = currentTimelineIndex;
    highlightTimelineEvent(currentTimelineIndex);
  } else if (isPlaying) {
    togglePlayback(); // Fin de reproducción
  }
}

function stepTimelineBack() {
  if (currentTimelineIndex > 0) {
    currentTimelineIndex--;
    const slider = document.getElementById('timeline-slider');
    if (slider) slider.value = currentTimelineIndex;
    highlightTimelineEvent(currentTimelineIndex);
  }
}

function togglePlayback() {
  const btn = document.getElementById('btn-timeline-play');
  if (isPlaying) {
    clearInterval(playbackTimer);
    isPlaying = false;
    if (btn) btn.innerHTML = '<i class="bi bi-play-fill"></i> Reproducir';
  } else {
    isPlaying = true;
    if (btn) btn.innerHTML = '<i class="bi bi-pause-fill"></i> Pausar';
    playbackTimer = setInterval(() => {
      stepTimelineForward();
    }, 1100);
  }
}

function resetTimelinePlayback() {
  if (isPlaying) togglePlayback();
  currentTimelineIndex = 0;
  const slider = document.getElementById('timeline-slider');
  if (slider) slider.value = 0;
  highlightTimelineEvent(0);
}

function highlightTimelineEvent(index) {
  if (!timelineEvents.length || index < 0 || index >= timelineEvents.length) return;

  const ev = timelineEvents[index];

  // Si ya hay un marcador de paso previo, removerlo
  if (playbackMarker) {
    playbackMarker.remove();
  }

  // Crear marcador destacado pulsante
  const radarIcon = window.L.divIcon({
    html: `
      <div style="position: relative;">
        <div style="position: absolute; top: -14px; left: -14px; width: 28px; height: 28px; border-radius: 50%; background: rgba(211,47,47,0.4); animation: pulse-ring 1.5s infinite;"></div>
        <div style="width: 14px; height: 14px; border-radius: 50%; background: #d32f2f; border: 2px solid #fff; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>
      </div>
    `,
    className: 'timeline-radar-step'
  });

  playbackMarker = window.L.marker([ev.latitude, ev.longitude], { icon: radarIcon }).addTo(leafletMap);
  leafletMap.panTo([ev.latitude, ev.longitude], { animate: true, duration: 0.5 });

  updateTimelineStatusDisplay(ev);
}

function updateTimelineStatusDisplay(ev = null) {
  const textEl = document.getElementById('timeline-current-status');
  if (!textEl) return;

  if (!ev && timelineEvents.length > 0) {
    ev = timelineEvents[currentTimelineIndex];
  }

  if (ev) {
    textEl.innerHTML = `
      <strong>Paso ${currentTimelineIndex + 1} de ${timelineEvents.length}:</strong> 
      <span class="text-danger fw-bold font-monospace">${formatDateTime(ev.event_datetime)}</span> | 
      Origen: <strong>${formatPhoneNumber(ev.phone_origin)}</strong> &rarr; Destino: <strong>${formatPhoneNumber(ev.phone_destination)}</strong> | 
      Antena: <code>${escapeHtml(ev.cell_id)}</code> (${getAzimuthCardinal(ev.azimuth)})
    `;
  } else {
    textEl.textContent = 'Seleccione o reproduzca la línea de tiempo';
  }
}
