/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 8: modules/explorer.js
 * Explorador y Filtrado Forense de Registros Telefónicos (CDR)
 * ============================================================================
 * 
 * INCLUYE:
 * - Filtros por Fecha (Fecha exacta o rango Desde/Hasta)
 * - Filtro por Hora (Rango 00:00 a 23:59 y Turnos: Madrugada, Mañana, Tarde, Noche)
 * - Modales y Popups de Instrucciones Forenses
 * - Paginación a 50 registros por página
 * - Exportación a CSV
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDateTime, formatDuration, exportToCSV, showToast, getAzimuthCardinal, getLocalHour } from '../utils.js';

const PAGE_SIZE = 50;
let currentPage = 1;
let allRecords = [];
let filteredRecords = [];

export function initExplorerModule() {
  console.log('[Explorer] Inicializando explorador de registros con filtros de fecha, hora y modales...');

  // Listeners de filtros de texto y operadores
  document.getElementById('filter-search-quick')?.addEventListener('input', applyFilters);
  document.getElementById('filter-origin')?.addEventListener('input', applyFilters);
  document.getElementById('filter-destination')?.addEventListener('input', applyFilters);
  document.getElementById('filter-event-type')?.addEventListener('change', applyFilters);
  document.getElementById('filter-operator')?.addEventListener('change', applyFilters);
  document.getElementById('filter-direction')?.addEventListener('change', applyFilters);

  // Listeners de filtros por Fecha
  document.getElementById('filter-date-specific')?.addEventListener('change', () => {
    // Si elige fecha específica, limpiar rango desde/hasta para evitar conflicto
    const spec = document.getElementById('filter-date-specific')?.value;
    if (spec) {
      const fromEl = document.getElementById('filter-date-from');
      const toEl = document.getElementById('filter-date-to');
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
    }
    applyFilters();
  });
  document.getElementById('filter-date-from')?.addEventListener('change', () => {
    const specEl = document.getElementById('filter-date-specific');
    if (specEl) specEl.value = '';
    applyFilters();
  });
  document.getElementById('filter-date-to')?.addEventListener('change', () => {
    const specEl = document.getElementById('filter-date-specific');
    if (specEl) specEl.value = '';
    applyFilters();
  });

  // Listeners de filtros por Hora
  document.getElementById('filter-hour-preset')?.addEventListener('change', handleHourPresetChange);
  document.getElementById('filter-hour-from')?.addEventListener('change', applyFilters);
  document.getElementById('filter-hour-to')?.addEventListener('change', applyFilters);

  document.getElementById('btn-reset-filters')?.addEventListener('click', resetFilters);
  document.getElementById('btn-export-explorer-csv')?.addEventListener('click', handleExportCSV);

  // Paginación
  document.getElementById('btn-page-prev')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePage();
    }
  });

  document.getElementById('btn-page-next')?.addEventListener('click', () => {
    const maxPage = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1;
    if (currentPage < maxPage) {
      currentPage++;
      renderTablePage();
    }
  });
}

function handleHourPresetChange(e) {
  const preset = e.target.value;
  const fromInput = document.getElementById('filter-hour-from');
  const toInput = document.getElementById('filter-hour-to');

  if (!fromInput || !toInput) return;

  switch (preset) {
    case 'madrugada': // 00:00 - 05:59 (Horario Crítico de Extorsión)
      fromInput.value = '00';
      toInput.value = '05';
      break;
    case 'manana': // 06:00 - 11:59
      fromInput.value = '06';
      toInput.value = '11';
      break;
    case 'tarde': // 12:00 - 17:59
      fromInput.value = '12';
      toInput.value = '17';
      break;
    case 'noche': // 18:00 - 23:59
      fromInput.value = '18';
      toInput.value = '23';
      break;
    default:
      fromInput.value = '';
      toInput.value = '';
      break;
  }

  applyFilters();
}

export async function renderExplorer() {
  allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  applyFilters();
}

function applyFilters() {
  const quickSearch = (document.getElementById('filter-search-quick')?.value || '').trim();
  const originFilter = (document.getElementById('filter-origin')?.value || '').trim();
  const destFilter = (document.getElementById('filter-destination')?.value || '').trim();
  const eventType = document.getElementById('filter-event-type')?.value || '';
  const operator = document.getElementById('filter-operator')?.value || '';
  const direction = document.getElementById('filter-direction')?.value || '';

  // Filtros de Fecha
  const dateSpecific = document.getElementById('filter-date-specific')?.value;
  const dateFrom = document.getElementById('filter-date-from')?.value;
  const dateTo = document.getElementById('filter-date-to')?.value;

  // Filtros de Hora
  const hourFromStr = document.getElementById('filter-hour-from')?.value;
  const hourToStr = document.getElementById('filter-hour-to')?.value;
  const hourFrom = hourFromStr !== '' ? parseInt(hourFromStr, 10) : null;
  const hourTo = hourToStr !== '' ? parseInt(hourToStr, 10) : null;

  filteredRecords = allRecords.filter(r => {
    // 1. Búsqueda rápida
    if (quickSearch) {
      const match = (r.phone_origin && r.phone_origin.includes(quickSearch)) ||
                    (r.phone_destination && r.phone_destination.includes(quickSearch)) ||
                    (r.cell_id && r.cell_id.toLowerCase().includes(quickSearch.toLowerCase()));
      if (!match) return false;
    }

    // 2. Filtros de origen, destino y catálogos
    if (originFilter && (!r.phone_origin || !r.phone_origin.includes(originFilter))) return false;
    if (destFilter && (!r.phone_destination || !r.phone_destination.includes(destFilter))) return false;
    if (eventType && r.event_type !== eventType) return false;
    if (operator && r.operator !== operator) return false;
    if (direction && r.direction !== direction) return false;

    // 3. Filtro por Fecha Exacta
    if (dateSpecific && r.event_datetime) {
      const recDate = r.event_datetime.substring(0, 10);
      if (recDate !== dateSpecific) return false;
    }

    // 4. Filtro por Rango de Fechas (Desde / Hasta)
    if (dateFrom && new Date(r.event_datetime) < new Date(dateFrom)) return false;
    if (dateTo && new Date(r.event_datetime) > new Date(dateTo + 'T23:59:59')) return false;

    // 5. Filtro por Hora (00 a 23)
    if ((hourFrom !== null || hourTo !== null) && r.event_datetime) {
      const d = new Date(r.event_datetime);
      if (!isNaN(d.getTime())) {
        const h = getLocalHour(d);
        if (hourFrom !== null && h < hourFrom) return false;
        if (hourTo !== null && h > hourTo) return false;
      }
    }

    return true;
  });

  currentPage = 1;
  renderTablePage();
}

function resetFilters() {
  document.getElementById('filter-search-quick').value = '';
  document.getElementById('filter-origin').value = '';
  document.getElementById('filter-destination').value = '';
  document.getElementById('filter-event-type').value = '';
  document.getElementById('filter-operator').value = '';
  document.getElementById('filter-direction').value = '';
  
  // Limpiar Fechas
  const specEl = document.getElementById('filter-date-specific');
  if (specEl) specEl.value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';

  // Limpiar Horas
  const presetEl = document.getElementById('filter-hour-preset');
  if (presetEl) presetEl.value = '';
  const hFrom = document.getElementById('filter-hour-from');
  if (hFrom) hFrom.value = '';
  const hTo = document.getElementById('filter-hour-to');
  if (hTo) hTo.value = '';

  applyFilters();
  showToast('Filtros de fecha, hora y números restablecidos', 'info');
}

function renderTablePage() {
  const tbody = document.getElementById('explorer-table-body');
  if (!tbody) return;

  const total = filteredRecords.length;
  const maxPage = Math.ceil(total / PAGE_SIZE) || 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRecords.slice(start, start + PAGE_SIZE);

  // Actualizar indicadores de paginación
  const countBadge = document.getElementById('explorer-total-count');
  if (countBadge) countBadge.textContent = `${total.toLocaleString()} registros`;

  const pageIndicator = document.getElementById('explorer-page-indicator');
  if (pageIndicator) pageIndicator.textContent = `Página ${currentPage} de ${maxPage}`;

  const prevBtn = document.getElementById('btn-page-prev');
  const nextBtn = document.getElementById('btn-page-next');
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= maxPage;

  if (pageRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron registros telefónicos con los filtros de fecha, hora o número aplicados.</td></tr>';
    return;
  }

  tbody.innerHTML = pageRows.map(row => {
    const operatorBadge = row.operator === 'AT&T' ? 'badge-att' : row.operator === 'Movistar' ? 'badge-movistar' : 'badge-telcel';
    const typeBadge = row.event_type === 'sms' ? 'badge-sms' : row.event_type === 'datos' ? 'badge-datos' : 'badge-llamada';
    const dirBadge = row.direction === 'entrante' ? 'badge-entrante' : 'badge-saliente';

    // Detección visual si es hora nocturna crítica (00:00 a 05:00)
    const d = new Date(row.event_datetime);
    const isNight = !isNaN(d.getTime()) && getLocalHour(d) <= 5;

    return `
      <tr class="${isNight ? 'table-warning' : ''}">
        <td class="text-nowrap">
          ${formatDateTime(row.event_datetime)}
          ${isNight ? '<span class="badge bg-danger ms-1" title="Horario Crítico de Madrugada">🌙 00-05h</span>' : ''}
        </td>
        <td class="fw-bold text-navy">
          <span class="badge bg-light text-dark me-1" title="Analizar este número en profundidad" style="cursor:pointer;" onclick="window.quickAnalyze('${row.phone_origin}')">
            🔍
          </span>
          ${formatPhoneNumber(row.phone_origin)}
        </td>
        <td class="fw-bold text-secondary">
          <span class="badge bg-light text-dark me-1" title="Analizar este número en profundidad" style="cursor:pointer;" onclick="window.quickAnalyze('${row.phone_destination}')">
            🔍
          </span>
          ${formatPhoneNumber(row.phone_destination)}
        </td>
        <td><span class="badge ${typeBadge}">${row.event_type.toUpperCase()}</span></td>
        <td><span class="badge ${dirBadge}">${row.direction}</span></td>
        <td>${formatDuration(row.duration_seconds)}</td>
        <td><span class="badge ${operatorBadge}">${row.operator}</span></td>
        <td><code>${row.cell_id}</code></td>
        <td class="text-center">
          <button class="btn btn-xs btn-outline-primary py-0 px-2" title="Detalle forense de antena y celda" onclick="window.viewRecordDetail('${row.rec_id}')">
            Detalle
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleExportCSV() {
  exportToCSV('sabana_filtrada_juarez', filteredRecords);
}

// Helpers globales para llamadas directas desde HTML
window.quickAnalyze = function(phone) {
  if (window.sabtelApp) {
    window.sabtelApp.switchView('analyzer');
    const input = document.getElementById('analyzer-phone-input');
    if (input) {
      input.value = phone;
      document.getElementById('btn-run-analysis')?.click();
    }
  }
};

window.viewRecordDetail = function(recId) {
  const record = allRecords.find(r => r.rec_id === recId);
  if (!record) return;

  const modalBody = document.getElementById('record-detail-modal-body');
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">
          <label class="text-muted small">Número Origen (A):</label>
          <div class="fw-bold fs-6 text-navy">${formatPhoneNumber(record.phone_origin)}</div>
        </div>
        <div class="col-md-6">
          <label class="text-muted small">Número Destino (B):</label>
          <div class="fw-bold fs-6 text-secondary">${formatPhoneNumber(record.phone_destination)}</div>
        </div>
        <div class="col-md-6">
          <label class="text-muted small">Fecha y Hora:</label>
          <div class="fw-bold">${formatDateTime(record.event_datetime)}</div>
        </div>
        <div class="col-md-6">
          <label class="text-muted small">Duración:</label>
          <div>${formatDuration(record.duration_seconds)} (${record.duration_seconds} seg)</div>
        </div>
        <div class="col-md-6">
          <label class="text-muted small">Antena / Cell ID:</label>
          <div><code>${record.cell_id}</code></div>
        </div>
        <div class="col-md-6">
          <label class="text-muted small">Orientación / Azimut:</label>
          <div>${getAzimuthCardinal(record.azimuth)}</div>
        </div>
        <div class="col-12">
          <label class="text-muted small">Coordenadas GPS de la Antena:</label>
          <div class="alert alert-light border mb-0 d-flex justify-content-between align-items-center">
            ${record.latitude != null ? `
            <span><strong>Latitud:</strong> ${record.latitude} | <strong>Longitud:</strong> ${record.longitude}
              <small class="text-muted">(${record.coord_source === 'catalogo' ? 'catálogo de antenas' : 'sábana'}${record.source_row ? ` · renglón ${record.source_row} del archivo` : ''})</small></span>
            <a href="https://www.google.com/maps?q=${record.latitude},${record.longitude}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-danger">
              <i class="bi bi-geo-alt"></i> Satélite
            </a>` : '<span class="text-muted">Celda sin coordenada en el catálogo (no se ubica en el mapa).</span>'}
          </div>
        </div>
      </div>
    `;
  }

  const modalEl = document.getElementById('recordDetailModal');
  if (modalEl && window.bootstrap) {
    const modal = new window.bootstrap.Modal(modalEl);
    modal.show();
  }
};
