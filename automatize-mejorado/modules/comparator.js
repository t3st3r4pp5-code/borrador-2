/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 10: modules/comparator.js
 * Módulo de Comparación Cruzada entre 2 o más Números Telefónicos
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import {
  formatPhoneNumber, formatDateTime, formatDuration, sanitizePhoneNumber, showToast,
  escapeHtml, haversineKm, parseLocalDateTime
} from '../utils.js';

// Radio de cobertura supuesto por antena cuando el catálogo no lo trae (zona urbana)
const DEFAULT_COVERAGE_KM = 1.5;
// Velocidad implícita a partir de la cual un cambio de antena se marca como dato dudoso
const IMPLAUSIBLE_SPEED_KMH = 150;

export function initComparatorModule() {
  console.log('[Comparator] Inicializando comparador de vínculos...');

  document.getElementById('btn-run-comparator')?.addEventListener('click', handleRunComparator);
  document.getElementById('comparator-ref-time')?.addEventListener('change', () => lastRun && handleRunComparator());
  document.getElementById('comparator-silence-hours')?.addEventListener('change', () => lastRun && handleRunComparator());
}

let lastRun = false;

const involves = (r, phone) => r.phone_origin === phone || r.phone_destination === phone;
const ts = (r) => new Date(r.event_datetime).getTime();

/**
 * Registros cuya antena corresponde a la línea: los de su propia sábana (target_phone).
 * Si el número solo aparece como contraparte en la sábana de otro, la antena es de la otra línea.
 */
function locationRecordsOf(phone, allRecords) {
  const own = allRecords.filter(r => r.target_phone === phone);
  if (own.length) return { pool: own.sort((a, b) => ts(a) - ts(b)), ownSheet: true };
  const party = allRecords.filter(r => involves(r, phone));
  return { pool: party.sort((a, b) => ts(a) - ts(b)), ownSheet: false };
}

function lastConnectionOf(phone, allRecords, refTs, silenceHours) {
  const { pool, ownSheet } = locationRecordsOf(phone, allRecords);
  const before = refTs === null ? pool : pool.filter(r => ts(r) <= refTs);
  const last = before[before.length - 1] || null;
  const previous = before.length > 1 ? before[before.length - 2] : null;
  const nextAfter = refTs === null ? null : pool.find(r => ts(r) > refTs) || null;

  let impliedSpeedKmh = null;
  if (last && previous && last.cell_id !== previous.cell_id && last.latitude != null && previous.latitude != null) {
    const hours = (ts(last) - ts(previous)) / 3_600_000;
    const km = haversineKm(previous.latitude, previous.longitude, last.latitude, last.longitude);
    impliedSpeedKmh = hours > 0 ? km / hours : Infinity;
  }

  // Silencios: huecos sin ningún registro mayores al umbral, incluido el final del periodo de la sábana
  const silences = [];
  const thresholdMs = silenceHours * 3_600_000;
  for (let i = 1; i < pool.length; i++) {
    const gap = ts(pool[i]) - ts(pool[i - 1]);
    if (gap >= thresholdMs) silences.push({ from: pool[i - 1], to: pool[i], hours: gap / 3_600_000 });
  }
  if (pool.length) {
    const sheetIds = new Set(pool.map(r => r.import_id));
    const periodEnd = Math.max(...allRecords.filter(r => sheetIds.has(r.import_id)).map(ts));
    const tail = periodEnd - ts(pool[pool.length - 1]);
    if (tail >= thresholdMs) silences.push({ from: pool[pool.length - 1], to: null, hours: tail / 3_600_000 });
  }
  silences.sort((a, b) => b.hours - a.hours);

  return { phone, ownSheet, last, previous, nextAfter, impliedSpeedKmh, silences, total: pool.length };
}

function compareLastConnections(a, b) {
  if (!a.last || !b.last) return { kind: 'sin_registro', label: 'Sin registro previo a la hora de referencia en alguna de las líneas', cls: 'secondary' };
  if (a.last.latitude == null || b.last.latitude == null) {
    return { kind: 'sin_resolver', label: 'Alguna antena no tiene coordenada en el catálogo', cls: 'secondary' };
  }
  const km = haversineKm(a.last.latitude, a.last.longitude, b.last.latitude, b.last.longitude);
  const gapMin = Math.round(Math.abs(ts(a.last) - ts(b.last)) / 60000);
  if (a.last.cell_id === b.last.cell_id) return { kind: 'misma', label: 'Misma antena', cls: 'danger', km, gapMin };
  if (km <= DEFAULT_COVERAGE_KM * 2) return { kind: 'cercanas', label: 'Antenas cercanas (las coberturas pueden traslaparse)', cls: 'warning', km, gapMin };
  return { kind: 'lejanas', label: 'Antenas lejanas', cls: 'success', km, gapMin };
}

/**
 * Para cada antena compartida, el par de eventos más cercano en el tiempo
 */
function sharedAntennaDetail(recsA, recsB) {
  const byCellB = new Map();
  recsB.forEach(r => {
    if (!r.cell_id || r.cell_id === 'SIN_CELDA') return;
    if (!byCellB.has(r.cell_id)) byCellB.set(r.cell_id, []);
    byCellB.get(r.cell_id).push(ts(r));
  });
  const best = new Map();
  recsA.forEach(r => {
    const times = byCellB.get(r.cell_id);
    if (!times) return;
    const t = ts(r);
    const minGap = Math.min(...times.map(x => Math.abs(x - t)));
    const current = best.get(r.cell_id);
    if (!current || minGap < current.minGapMs) best.set(r.cell_id, { cell_id: r.cell_id, minGapMs: minGap, when: r.event_datetime });
  });
  return Array.from(best.values()).sort((x, y) => x.minGapMs - y.minGapMs);
}

async function handleRunComparator() {
  const phoneA = sanitizePhoneNumber(document.getElementById('comparator-phone-a')?.value || '');
  const phoneB = sanitizePhoneNumber(document.getElementById('comparator-phone-b')?.value || '');

  if (!phoneA || !phoneB || phoneA === 'DESCONOCIDO' || phoneB === 'DESCONOCIDO') {
    showToast('Debe ingresar ambos números telefónicos para realizar la vinculación.', 'warning');
    return;
  }

  if (phoneA === phoneB) {
    showToast('Los dos números deben ser distintos para comparar vínculos cruzados.', 'warning');
    return;
  }

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);

  // 1. Verificar comunicaciones directas A <-> B
  const directEvents = allRecords.filter(r =>
    (r.phone_origin === phoneA && r.phone_destination === phoneB) ||
    (r.phone_origin === phoneB && r.phone_destination === phoneA)
  ).sort((a, b) => ts(a) - ts(b));

  // 2. Extraer contactos de cada uno para buscar contactos en común
  const contactsOfA = new Set();
  const contactsOfB = new Set();

  allRecords.forEach(r => {
    if (r.phone_origin === phoneA) contactsOfA.add(r.phone_destination);
    if (r.phone_destination === phoneA) contactsOfA.add(r.phone_origin);

    if (r.phone_origin === phoneB) contactsOfB.add(r.phone_destination);
    if (r.phone_destination === phoneB) contactsOfB.add(r.phone_origin);
  });

  [phoneA, phoneB, 'DATOS_INTERNET'].forEach(p => { contactsOfA.delete(p); contactsOfB.delete(p); });

  // Intersección de contactos
  const commonContacts = Array.from(contactsOfA).filter(c => contactsOfB.has(c));

  // 3. Antenas compartidas con el par de eventos más cercano en el tiempo. Se usan las antenas de la
  // sábana de cada línea y se excluyen las comunicaciones entre ambas (son el mismo evento, Δ = 0 trivial).
  const locA = locationRecordsOf(phoneA, allRecords);
  const locB = locationRecordsOf(phoneB, allRecords);
  const notBetween = r => !(involves(r, phoneA) && involves(r, phoneB));
  const sharedAntennas = sharedAntennaDetail(locA.pool.filter(notBetween), locB.pool.filter(notBetween));
  sharedAntennas.bothSheets = locA.ownSheet && locB.ownSheet;

  // 4. Línea de tiempo conjunta
  const combinedTimeline = allRecords.filter(r => involves(r, phoneA) || involves(r, phoneB)).sort((a, b) => ts(a) - ts(b));

  // 5. Última conexión registrada y silencios
  const refRaw = document.getElementById('comparator-ref-time')?.value || '';
  const refDate = refRaw ? parseLocalDateTime(refRaw.replace('T', ' ')) : null;
  const refTs = refDate ? refDate.getTime() : null;
  const silenceHours = parseFloat(document.getElementById('comparator-silence-hours')?.value) || 6;
  const lastA = lastConnectionOf(phoneA, allRecords, refTs, silenceHours);
  const lastB = lastConnectionOf(phoneB, allRecords, refTs, silenceHours);

  lastRun = true;
  renderComparatorResults(phoneA, phoneB, directEvents, commonContacts, sharedAntennas, combinedTimeline);
  renderLastConnection(lastA, lastB, compareLastConnections(lastA, lastB), refTs, silenceHours);
}

function renderComparatorResults(phoneA, phoneB, directEvents, commonContacts, sharedAntennas, timeline) {
  const container = document.getElementById('comparator-results-container');
  if (container) container.classList.remove('d-none');

  // Tarjeta de Comunicación Directa
  const directAlert = document.getElementById('comparator-direct-alert');
  if (directAlert) {
    if (directEvents.length > 0) {
      directAlert.className = 'alert alert-warning d-flex align-items-center justify-content-between';
      directAlert.innerHTML = `
        <div>
          <h5 class="alert-heading mb-1"><i class="bi bi-telephone-fill"></i> Comunicación directa registrada</h5>
          Se encontraron <strong>${directEvents.length} comunicaciones directas</strong> entre ${formatPhoneNumber(phoneA)} y ${formatPhoneNumber(phoneB)} en las sábanas cargadas.
        </div>
        <span class="badge bg-warning text-dark fs-6">${directEvents.length} EVENTOS</span>
      `;
    } else {
      directAlert.className = 'alert alert-secondary d-flex align-items-center justify-content-between';
      directAlert.innerHTML = `
        <div>
          <h5 class="alert-heading mb-1"><i class="bi bi-info-circle-fill"></i> Sin Comunicación Directa Detectada</h5>
          Los números no registran llamadas ni SMS directos entre sí en las sábanas disponibles.
        </div>
        <span class="badge bg-secondary fs-6">0 EVENTOS</span>
      `;
    }
  }

  // Tabla de Eventos Directos
  const directTbody = document.getElementById('comparator-direct-events-body');
  if (directTbody) {
    if (directEvents.length === 0) {
      directTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay comunicaciones directas en el periodo.</td></tr>';
    } else {
      directTbody.innerHTML = directEvents.map(ev => `
        <tr>
          <td>${formatDateTime(ev.event_datetime)}</td>
          <td><strong>${formatPhoneNumber(ev.phone_origin)}</strong></td>
          <td><i class="bi bi-arrow-right text-danger"></i></td>
          <td><strong>${formatPhoneNumber(ev.phone_destination)}</strong></td>
          <td><span class="badge bg-dark">${escapeHtml(String(ev.event_type).toUpperCase())}</span> (${formatDuration(ev.duration_seconds)})</td>
          <td><code>${escapeHtml(ev.cell_id)}</code></td>
        </tr>
      `).join('');
    }
  }

  // Contactos en Común
  const commonContactsEl = document.getElementById('comparator-common-contacts');
  if (commonContactsEl) {
    if (commonContacts.length === 0) {
      commonContactsEl.innerHTML = '<div class="text-muted p-2">No se encontraron contactos telefónicos intermediarios en común.</div>';
    } else {
      commonContactsEl.innerHTML = commonContacts.map(c => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <i class="bi bi-person-fill text-warning me-2"></i>
            <span class="fw-bold font-monospace">${escapeHtml(formatPhoneNumber(c))}</span>
          </div>
          <button class="btn btn-sm btn-outline-primary py-0" data-analyze-phone="${escapeHtml(c)}">
            Analizar número
          </button>
        </div>
      `).join('');
      commonContactsEl.querySelectorAll('[data-analyze-phone]').forEach(btn => {
        btn.addEventListener('click', () => window.quickAnalyze?.(btn.getAttribute('data-analyze-phone')));
      });
    }
  }

  // Antenas compartidas: una coincidencia de antena no prueba que estuvieran juntos
  const commonAntennasEl = document.getElementById('comparator-common-antennas');
  if (commonAntennasEl) {
    if (sharedAntennas.length === 0) {
      commonAntennasEl.innerHTML = '<div class="text-muted p-2">No se detectaron antenas compartidas en los registros.</div>';
    } else {
      commonAntennasEl.innerHTML = sharedAntennas.map(ant => {
        const minutes = Math.round(ant.minGapMs / 60000);
        const close = minutes <= 60;
        return `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <i class="bi bi-broadcast-pin ${close ? 'text-danger' : 'text-secondary'} me-2"></i>
              <code>${escapeHtml(ant.cell_id)}</code>
              <small class="text-muted ms-1">${formatDateTime(ant.when)}</small>
            </div>
            <span class="badge ${close ? 'bg-danger' : 'bg-secondary'}">Δ mínimo ${minutes < 120 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`}</span>
          </div>
        `;
      }).join('') + `<div class="small text-muted p-2">Compartir antena indica cobertura común, no que las personas estuvieran juntas. Revisar el Δ de tiempo.${sharedAntennas.bothSheets ? '' : ' <strong>Falta la sábana propia de uno de los números:</strong> sin ella, la antena registrada es la del titular de la otra sábana.'}</div>`;
    }
  }

// Línea de Tiempo Sincronizada
  renderSynchronizedTimeline(phoneA, phoneB, timeline.slice(0, 40));
  showToast('Cruce de información y análisis de vínculos completado.', 'success');
}

function renderSynchronizedTimeline(phoneA, phoneB, events) {
  const container = document.getElementById('comparator-timeline-container');
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = '<div class="text-muted p-3">No hay eventos para la línea de tiempo.</div>';
    return;
  }

  container.innerHTML = events.map(ev => {
    const isDirect = (ev.phone_origin === phoneA && ev.phone_destination === phoneB) || (ev.phone_origin === phoneB && ev.phone_destination === phoneA);
    const isOriginA = ev.phone_origin === phoneA;
    const actorColor = isDirect ? 'border-danger bg-light' : isOriginA ? 'border-primary' : 'border-success';

    return `
      <div class="timeline-item">
        <div class="timeline-dot ${isDirect ? 'critical' : ''}"></div>
        <div class="card p-2 shadow-sm ${actorColor}">
          <div class="d-flex justify-content-between small text-muted">
            <span>${formatDateTime(ev.event_datetime)}</span>
            <span class="badge bg-secondary">${escapeHtml(ev.cell_id)}</span>
          </div>
          <div class="mt-1">
            <strong>${formatPhoneNumber(ev.phone_origin)}</strong>
            <i class="bi bi-arrow-right mx-1"></i>
            <span>${formatPhoneNumber(ev.phone_destination)}</span>
            <span class="badge ${ev.event_type === 'llamada' ? 'bg-success' : 'bg-info text-dark'} ms-2">${escapeHtml(ev.event_type)} (${formatDuration(ev.duration_seconds)})</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * ============================================================================
 * ÚLTIMA CONEXIÓN REGISTRADA Y SILENCIOS
 * Pensado para personas desaparecidas o privadas de la libertad: la última antena antes de que el
 * teléfono deje de registrar actividad orienta la búsqueda. Es un dato histórico de la sábana, no rastreo.
 * ============================================================================
 */
function formatHours(h) {
  if (!isFinite(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

function cellLine(r) {
  if (!r) return '<span class="text-muted">Sin registro</span>';
  const coords = r.latitude != null
    ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)} <span class="text-muted">(${r.coord_source === 'catalogo' ? 'catálogo' : 'sábana'})</span>`
    : '<span class="text-danger">sin coordenada en el catálogo</span>';
  const row = r.source_row ? ` · renglón ${r.source_row}` : '';
  return `
    <div class="fw-bold">${formatDateTime(r.event_datetime)}</div>
    <div>Antena <code>${escapeHtml(r.cell_id)}</code> · ${coords}</div>
    <div class="text-muted small">${escapeHtml(r.event_type)} ${escapeHtml(r.direction || '')}${row} · ${escapeHtml(r.sheet_label || r.import_id || '')}</div>
  `;
}

function renderLastConnectionCard(label, color, lc, refTs) {
  const warnings = [];
  if (!lc.ownSheet && lc.total) {
    warnings.push('No hay sábana propia de este número: la antena mostrada es de la línea titular de la sábana donde aparece como contraparte.');
  }
  if (lc.impliedSpeedKmh !== null && lc.impliedSpeedKmh > IMPLAUSIBLE_SPEED_KMH) {
    warnings.push(`Salto inverosímil respecto al registro anterior (${isFinite(lc.impliedSpeedKmh) ? `~${Math.round(lc.impliedSpeedKmh)} km/h` : 'misma hora, antenas distintas'}): revisar catálogo, hora o zona horaria.`);
  }
  const silenceAfter = refTs !== null && lc.last
    ? (lc.nextAfter
      ? `Siguiente registro después de la hora de referencia: ${formatDateTime(lc.nextAfter.event_datetime)} (${formatHours((ts(lc.nextAfter) - ts(lc.last)) / 3_600_000)} sin actividad).`
      : '<strong>Sin registros posteriores en la sábana.</strong>')
    : '';

  return `
    <div class="col-md-6">
      <div class="card-forensic p-3 h-100" style="border-left: 4px solid ${color};">
        <div class="d-flex justify-content-between mb-2">
          <span class="small text-muted text-uppercase fw-bold">${label}</span>
          <span class="font-monospace fw-bold" style="color:${color}">${formatPhoneNumber(lc.phone)}</span>
        </div>
        <div class="small">${cellLine(lc.last)}</div>
        ${silenceAfter ? `<div class="small mt-2">${silenceAfter}</div>` : ''}
        ${warnings.map(w => `<div class="small text-warning-emphasis mt-2"><i class="bi bi-exclamation-triangle-fill text-warning"></i> ${w}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderSilencesTable(lc, silenceHours) {
  if (!lc.silences.length) {
    return `<div class="small text-muted">${formatPhoneNumber(lc.phone)}: sin silencios mayores a ${silenceHours} h.</div>`;
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-forensic align-middle mb-2">
        <thead><tr><th>${formatPhoneNumber(lc.phone)}</th><th>Último registro antes del silencio</th><th>Primer registro después</th><th class="text-end">Duración</th></tr></thead>
        <tbody>
          ${lc.silences.slice(0, 5).map(s => `
            <tr>
              <td></td>
              <td class="small">${formatDateTime(s.from.event_datetime)}<br><code>${escapeHtml(s.from.cell_id)}</code></td>
              <td class="small">${s.to ? `${formatDateTime(s.to.event_datetime)}<br><code>${escapeHtml(s.to.cell_id)}</code>` : '<span class="text-danger fw-bold">Fin del periodo de la sábana</span>'}</td>
              <td class="text-end fw-bold">${formatHours(s.hours)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLastConnection(lastA, lastB, comparison, refTs, silenceHours) {
  const el = document.getElementById('comparator-lastconn');
  if (!el) return;

  const refLabel = refTs !== null
    ? `antes de ${formatDateTime(refTs)}`
    : 'en toda la sábana';

  el.innerHTML = `
    <div class="row g-3 mb-3">
      ${renderLastConnectionCard('Línea A · última conexión ' + refLabel, '#0d6efd', lastA, refTs)}
      ${renderLastConnectionCard('Línea B · última conexión ' + refLabel, '#d97706', lastB, refTs)}
    </div>
    <div class="alert alert-${comparison.cls} d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <strong>${comparison.label}</strong>
      ${comparison.km !== undefined ? `<span class="font-monospace"><i class="bi bi-rulers"></i> ${comparison.km.toFixed(2)} km entre antenas · Δ ${comparison.gapMin < 120 ? `${comparison.gapMin} min` : formatHours(comparison.gapMin / 60)} entre registros</span>` : ''}
    </div>
    ${comparison.gapMin !== undefined && comparison.gapMin > 120 ? '<div class="small text-warning-emphasis mb-3">Los dos registros están separados por más de 2 horas: la comparación dice poco sobre un mismo momento.</div>' : ''}
    <h6 class="fw-bold mt-2"><i class="bi bi-hourglass-split"></i> Silencios mayores a ${silenceHours} h (sin llamadas, SMS ni datos)</h6>
    ${renderSilencesTable(lastA, silenceHours)}
    ${renderSilencesTable(lastB, silenceHours)}
    <p class="small text-muted mb-0 mt-2">
      La coordenada es la de la antena según catálogo, no la de la persona; una antena urbana cubre de cientos de metros a ~${DEFAULT_COVERAGE_KM} km y más en la periferia.
      La última conexión es el último evento en la sábana entregada por el operador, no la ubicación actual: esto no es rastreo en tiempo real.
      Un silencio puede deberse a teléfono apagado, sin señal, modo avión, batería o simplemente falta de uso. Todo resultado es un indicio para revisión del analista.
    </p>
  `;
}

