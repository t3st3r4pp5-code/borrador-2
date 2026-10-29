/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 9: modules/analyzer.js
 * Módulo de Análisis Forense de Número Individual (Blanco / Víctima)
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { renderRouteReading } from './route-reading.js';
import { formatPhoneNumber, formatDateTime, formatDuration, sanitizePhoneNumber, getAzimuthCardinal, showToast, getLocalHour, escapeHtml } from '../utils.js';

let chartTargetHourlyInstance = null;

export function initAnalyzerModule() {
  console.log('[Analyzer] Inicializando módulo de análisis individual...');

  document.getElementById('btn-run-analysis')?.addEventListener('click', handleExecuteAnalysis);
  document.getElementById('analyzer-phone-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleExecuteAnalysis();
  });
}

async function handleExecuteAnalysis() {
  const inputEl = document.getElementById('analyzer-phone-input');
  const targetPhone = sanitizePhoneNumber(inputEl?.value || '');

  if (!targetPhone || targetPhone.length < 7) {
    showToast('Por favor ingrese un número telefónico válido a analizar', 'warning');
    return;
  }

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  
  // Filtrar todos los eventos donde interviene el número (sea como origen o destino)
  const relatedRecords = allRecords.filter(r => 
    r.phone_origin === targetPhone || r.phone_destination === targetPhone
  );

  if (relatedRecords.length === 0) {
    showToast(`No se encontraron registros para el número ${formatPhoneNumber(targetPhone)} en la sábana activa`, 'warning');
    return;
  }

  renderAnalysisResults(targetPhone, relatedRecords);
}

function renderAnalysisResults(targetPhone, records) {
  const resultsCard = document.getElementById('analyzer-results-container');
  if (resultsCard) resultsCard.classList.remove('d-none');

  // Ordenar cronológicamente
  const sorted = [...records].sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));
  const latestEvent = sorted[sorted.length - 1];
  const firstEvent = sorted[0];

  // 1. Estadísticas Generales
  const totalEvents = records.length;
  const originatedCalls = records.filter(r => r.phone_origin === targetPhone);
  const receivedCalls = records.filter(r => r.phone_destination === targetPhone);
  
  const callsOnly = records.filter(r => r.event_type === 'llamada');
  const totalDuration = callsOnly.reduce((acc, r) => acc + (parseInt(r.duration_seconds, 10) || 0), 0);
  const avgDuration = callsOnly.length ? Math.round(totalDuration / callsOnly.length) : 0;

  // Actualizar UI
  document.getElementById('target-header-phone').textContent = formatPhoneNumber(targetPhone);
  document.getElementById('target-total-events').textContent = totalEvents;
  document.getElementById('target-originated-count').textContent = originatedCalls.length;
  document.getElementById('target-received-count').textContent = receivedCalls.length;
  document.getElementById('target-avg-duration').textContent = formatDuration(avgDuration);
  document.getElementById('target-total-duration').textContent = formatDuration(totalDuration);
  
  // Última celda / antena
  const lastCellEl = document.getElementById('target-last-antenna');
  if (lastCellEl && latestEvent) {
    lastCellEl.innerHTML = `
      <strong>${escapeHtml(latestEvent.cell_id)}</strong><br>
      <small class="text-muted">Fecha: ${formatDateTime(latestEvent.event_datetime)}</small><br>
      <small class="text-muted">${latestEvent.latitude != null
        ? `Antena: ${Number(latestEvent.latitude).toFixed(5)}, ${Number(latestEvent.longitude).toFixed(5)} (${getAzimuthCardinal(latestEvent.azimuth)}) · fuente: ${latestEvent.coord_source === 'catalogo' ? 'catálogo de antenas' : 'sábana'}`
        : 'Antena sin coordenada en el catálogo'}</small>
    `;
  }

  // 2. Gráfico Horario
  renderTargetHourlyChart(records);

  // 3. Top 10 Contactos Frecuentes
  renderTopContacts(targetPhone, records);

  // 4. Hotspots / Antenas más frecuentadas
  renderTopAntennas(records);

  // 5. Lectura automática de la secuencia de antenas y borrador de solicitud de videos
  renderRouteReading(targetPhone, records);

  showToast(`Análisis completado para ${formatPhoneNumber(targetPhone)} (${records.length} eventos)`, 'success');
}

function renderTargetHourlyChart(records) {
  const ctx = document.getElementById('chart-target-hourly');
  if (!ctx || !window.Chart) return;

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const counts = new Array(24).fill(0);

  records.forEach(r => {
    const d = new Date(r.event_datetime);
    if (!isNaN(d.getTime())) {
      counts[getLocalHour(d)]++;
    }
  });

  if (chartTargetHourlyInstance) {
    chartTargetHourlyInstance.destroy();
  }

  chartTargetHourlyInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: hours,
      datasets: [{
        label: 'Patrón de Actividad por Hora',
        data: counts,
        backgroundColor: hours.map((_, i) => (i >= 22 || i <= 5) ? '#d32f2f' : '#001f3f'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderTopContacts(targetPhone, records) {
  const container = document.getElementById('target-top-contacts-body');
  if (!container) return;

  const contactMap = {};

  records.forEach(r => {
    const contact = r.phone_origin === targetPhone ? r.phone_destination : r.phone_origin;
    if (!contact || contact === targetPhone) return;

    if (!contactMap[contact]) {
      contactMap[contact] = {
        phone: contact,
        count: 0,
        calls: 0,
        sms: 0,
        duration: 0,
        lastDate: r.event_datetime
      };
    }

    contactMap[contact].count++;
    if (r.event_type === 'llamada') {
      contactMap[contact].calls++;
      contactMap[contact].duration += (parseInt(r.duration_seconds, 10) || 0);
    } else {
      contactMap[contact].sms++;
    }

    if (new Date(r.event_datetime) > new Date(contactMap[contact].lastDate)) {
      contactMap[contact].lastDate = r.event_datetime;
    }
  });

  const sortedContacts = Object.values(contactMap).sort((a, b) => b.count - a.count).slice(0, 10);

  container.innerHTML = sortedContacts.map((c, idx) => `
    <tr>
      <td><strong>#${idx + 1}</strong></td>
      <td class="fw-bold text-navy">
        ${formatPhoneNumber(c.phone)}
      </td>
      <td><span class="badge bg-primary">${c.count}</span></td>
      <td>${c.calls} ll / ${c.sms} sms</td>
      <td>${formatDuration(c.duration)}</td>
      <td class="small">${formatDateTime(c.lastDate)}</td>
      <td>
        <button class="btn btn-xs btn-outline-danger py-0 px-2" title="Comparar con este número" onclick="window.compareWithTarget('${targetPhone}', '${c.phone}')">
          Comparar
        </button>
      </td>
    </tr>
  `).join('');
}

function renderTopAntennas(records) {
  const container = document.getElementById('target-top-antennas-body');
  if (!container) return;

  const antennaMap = {};
  records.forEach(r => {
    if (!r.cell_id) return;
    if (!antennaMap[r.cell_id]) {
      antennaMap[r.cell_id] = { cell_id: r.cell_id, count: 0, lat: r.latitude, lng: r.longitude };
    }
    antennaMap[r.cell_id].count++;
  });

  const sortedAntennas = Object.values(antennaMap).sort((a, b) => b.count - a.count).slice(0, 5);

  container.innerHTML = sortedAntennas.map((ant, idx) => `
    <tr>
      <td><code>${escapeHtml(ant.cell_id)}</code></td>
      <td><span class="badge bg-secondary">${ant.count} conexiones</span></td>
      <td class="small text-muted">${ant.lat != null ? `${Number(ant.lat).toFixed(4)}, ${Number(ant.lng).toFixed(4)}` : 'sin coordenada'}</td>
    </tr>
  `).join('');
}

window.compareWithTarget = function(phoneA, phoneB) {
  if (window.sabtelApp) {
    window.sabtelApp.switchView('comparator');
    const inputA = document.getElementById('comparator-phone-a');
    const inputB = document.getElementById('comparator-phone-b');
    if (inputA && inputB) {
      inputA.value = phoneA;
      inputB.value = phoneB;
      document.getElementById('btn-run-comparator')?.click();
    }
  }
};
