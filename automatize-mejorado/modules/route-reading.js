/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/route-reading.js
 * Lectura automática de la secuencia de antenas de un número y borrador de solicitud de videos
 * ============================================================================
 *
 * - Zonas habituales: antena más frecuente de noche (00-06 h) y de día (08-19 h).
 * - Cambios de antena con distancia, tiempo y velocidad implícita (saltos inverosímiles = dato a revisar).
 * - Silencios: último registro antes y primero después.
 * - Borrador de oficio para solicitar videos (VMS / C4 / particulares) en la ventana de tiempo de los
 *   eventos elegidos y en el radio de cobertura de cada antena. Lo revisa y firma el Ministerio Público.
 *
 * La antena indica cobertura, no la ubicación de la persona. Todo es indicio para revisión del analista.
 */

import {
  formatPhoneNumber, formatDateTime, escapeHtml, haversineKm, getLocalHour, toLocalParts, showToast
} from '../utils.js';

const IMPLAUSIBLE_SPEED_KMH = 150;
const CAMERA_KEY = 'sabtel_camera_catalog';

let currentPhone = '';
let currentEvents = [];

const ts = (r) => new Date(r.event_datetime).getTime();

function formatHours(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

function topCell(records) {
  const counts = new Map();
  records.forEach(r => {
    if (!r.cell_id || r.cell_id === 'SIN_CELDA') return;
    counts.set(r.cell_id, (counts.get(r.cell_id) || 0) + 1);
  });
  const [cell, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return cell ? { cell, count, total: records.length, sample: records.find(r => r.cell_id === cell) } : null;
}

/**
 * Catálogo opcional de cámaras (CSV: id_camara, descripcion, latitud, longitud)
 */
function getCameraCatalog() {
  try {
    return JSON.parse(localStorage.getItem(CAMERA_KEY) || '[]');
  } catch {
    return [];
  }
}

function parseSimpleCsv(text) {
  if (window.Papa) return window.Papa.parse(text, { header: true, skipEmptyLines: true }).data;
  const [headerLine, ...lines] = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const headers = headerLine.split(',').map(h => h.trim());
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [headers[i], v.trim()])));
}

function saveCameraRows(rows) {
  const cams = rows.map(r => ({
    id: r.id_camara || r.id || r.camara,
    description: r.descripcion || r.description || '',
    lat: parseFloat(r.latitud ?? r.lat),
    lng: parseFloat(r.longitud ?? r.lng ?? r.lon)
  })).filter(c => c.id && !isNaN(c.lat) && !isNaN(c.lng));
  localStorage.setItem(CAMERA_KEY, JSON.stringify(cams));
  showToast(`Catálogo de cámaras: ${cams.length} cámaras cargadas.`, 'success');
  renderRouteReading(currentPhone, currentEvents);
}

/**
 * Registros de la propia sábana del número si existen; si no, todos donde aparece (con advertencia)
 */
export function renderRouteReading(phone, relatedRecords) {
  const el = document.getElementById('target-route-summary');
  if (!el) return;
  currentPhone = phone;
  currentEvents = relatedRecords;

  const own = relatedRecords.filter(r => r.target_phone === phone);
  const pool = (own.length ? own : relatedRecords).slice().sort((a, b) => ts(a) - ts(b));
  const located = pool.filter(r => r.latitude != null);

  const night = topCell(pool.filter(r => getLocalHour(r.event_datetime) <= 6));
  const day = topCell(pool.filter(r => { const h = getLocalHour(r.event_datetime); return h >= 8 && h <= 19; }));

  // Cambios de antena consecutivos con coordenadas
  const changes = [];
  for (let i = 1; i < located.length; i++) {
    const a = located[i - 1];
    const b = located[i];
    if (a.cell_id === b.cell_id) continue;
    const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const hours = (ts(b) - ts(a)) / 3_600_000;
    changes.push({ from: a, to: b, km, hours, speed: hours > 0 ? km / hours : Infinity });
  }

  // Silencio más largo
  let longest = null;
  for (let i = 1; i < pool.length; i++) {
    const hours = (ts(pool[i]) - ts(pool[i - 1])) / 3_600_000;
    if (!longest || hours > longest.hours) longest = { from: pool[i - 1], to: pool[i], hours };
  }

  const last = pool[pool.length - 1];
  const jumps = changes.filter(c => c.speed > IMPLAUSIBLE_SPEED_KMH);
  const cameras = getCameraCatalog();

  // Eventos clave candidatos para la solicitud de videos
  const keyEvents = [];
  if (last) keyEvents.push({ label: 'Último registro de la sábana', rec: last });
  if (longest && longest.hours >= 2) {
    keyEvents.push({ label: `Último registro antes del silencio más largo (${formatHours(longest.hours)})`, rec: longest.from });
    keyEvents.push({ label: 'Primer registro después del silencio más largo', rec: longest.to });
  }
  changes.slice(-8).reverse().forEach(c => keyEvents.push({ label: `Cambio de antena (${c.km.toFixed(1)} km en ${formatHours(c.hours)})`, rec: c.to }));

  const cellBadge = (info, label) => info
    ? `<div class="col-md-4"><div class="border rounded p-2 h-100"><div class="small text-muted">${label}</div>
        <div><code>${escapeHtml(info.cell)}</code> · ${info.count} de ${info.total} eventos</div>
        <div class="small text-muted">${info.sample?.latitude != null ? `${Number(info.sample.latitude).toFixed(4)}, ${Number(info.sample.longitude).toFixed(4)}` : 'sin coordenada'}</div></div></div>`
    : `<div class="col-md-4"><div class="border rounded p-2 h-100 small text-muted">${label}: sin eventos en ese horario</div></div>`;

  el.innerHTML = `
    ${own.length ? '' : '<div class="alert alert-warning small py-2">No hay sábana propia de este número: las antenas son de la línea titular de la sábana donde aparece como contraparte.</div>'}
    <div class="row g-2 mb-3">
      ${cellBadge(night, 'Antena habitual de noche (00–06 h)')}
      ${cellBadge(day, 'Antena habitual de día (08–19 h)')}
      <div class="col-md-4"><div class="border rounded p-2 h-100"><div class="small text-muted">Silencio más largo</div>
        ${longest ? `<div class="fw-bold">${formatHours(longest.hours)}</div><div class="small">desde ${formatDateTime(longest.from.event_datetime)} en <code>${escapeHtml(longest.from.cell_id)}</code></div>` : '<div class="small text-muted">Sin datos</div>'}
      </div></div>
    </div>

    <div class="small mb-2"><strong>${changes.length}</strong> cambios de antena con coordenadas ·
      <strong class="${jumps.length ? 'text-danger' : ''}">${jumps.length}</strong> saltos inverosímiles (&gt; ${IMPLAUSIBLE_SPEED_KMH} km/h, revisar catálogo u hora)</div>
    ${changes.length ? `
    <div class="table-responsive mb-3" style="max-height: 260px; overflow:auto;">
      <table class="table table-sm table-forensic align-middle mb-0">
        <thead><tr><th>Desde</th><th>Hacia</th><th class="text-end">Distancia</th><th class="text-end">Tiempo</th><th class="text-end">Velocidad implícita</th></tr></thead>
        <tbody>
          ${changes.slice(-30).reverse().map(c => `
            <tr class="${c.speed > IMPLAUSIBLE_SPEED_KMH ? 'table-danger' : ''}">
              <td class="small">${formatDateTime(c.from.event_datetime)}<br><code>${escapeHtml(c.from.cell_id)}</code></td>
              <td class="small">${formatDateTime(c.to.event_datetime)}<br><code>${escapeHtml(c.to.cell_id)}</code></td>
              <td class="text-end">${c.km.toFixed(2)} km</td>
              <td class="text-end">${formatHours(c.hours)}</td>
              <td class="text-end">${isFinite(c.speed) ? `${Math.round(c.speed)} km/h` : 'misma hora'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <hr>
    <h6 class="fw-bold"><i class="bi bi-camera-video me-1"></i> Borrador de solicitud de videos</h6>
    <p class="small text-muted mb-2">Elija los eventos. Para cada uno se pide video en una ventana de tiempo alrededor de la hora del registro, en el radio de cobertura de la antena.
      ${cameras.length ? `Hay <strong>${cameras.length}</strong> cámaras en el catálogo; se listan las que caen dentro del radio.` : 'Si carga un catálogo de cámaras (VMS / C4), se listan las que caen dentro del radio.'}</p>
    <div class="row g-2 mb-2">
      <div class="col-md-4"><input id="video-nuc" class="form-control form-control-sm" placeholder="NUC / Carpeta de investigación" /></div>
      <div class="col-md-4"><input id="video-oficio" class="form-control form-control-sm" placeholder="Número de oficio (opcional)" /></div>
      <div class="col-md-4"><input id="video-dependencia" class="form-control form-control-sm" placeholder="Dirigido a (C4 / VMS / responsable)" /></div>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <label class="small">Ventana ±</label>
      <select id="video-window-min" class="form-select form-select-sm" style="width:auto"><option>15</option><option selected>30</option><option>60</option></select>
      <label class="small">min · Radio</label>
      <select id="video-radius-km" class="form-select form-select-sm" style="width:auto"><option value="0.5">0.5 km</option><option value="1" selected>1 km</option><option value="1.5">1.5 km</option><option value="3">3 km</option></select>
      <input type="file" id="camera-catalog-input" accept=".csv" class="form-control form-control-sm" style="max-width:220px" title="Catálogo de cámaras CSV" />
      <button id="btn-load-sample-cameras" class="btn btn-sm btn-outline-secondary">Cámaras sintéticas</button>
    </div>
    <div class="list-group mb-2" style="max-height: 220px; overflow:auto;">
      ${keyEvents.map((k, i) => `
        <label class="list-group-item small d-flex gap-2 align-items-start">
          <input type="checkbox" class="form-check-input mt-1 video-event-check" data-idx="${i}" ${i < 3 ? 'checked' : ''} />
          <span><strong>${escapeHtml(k.label)}</strong><br>${formatDateTime(k.rec.event_datetime)} · <code>${escapeHtml(k.rec.cell_id)}</code>
            ${k.rec.latitude != null ? '' : ' · <span class="text-danger">sin coordenada</span>'}</span>
        </label>`).join('')}
    </div>
    <button id="btn-generate-video-request" class="btn btn-sm btn-primary"><i class="bi bi-file-earmark-word"></i> Generar borrador (.doc)</button>
    <p class="small text-muted mt-2 mb-0">Indicio para revisión del analista: la antena no es la ubicación de la persona y la última conexión no es rastreo en tiempo real.</p>
  `;

  document.getElementById('camera-catalog-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) saveCameraRows(parseSimpleCsv(await file.text()));
  });
  document.getElementById('btn-load-sample-cameras')?.addEventListener('click', async () => {
    try {
      saveCameraRows(parseSimpleCsv(await (await fetch('demo/camaras_sinteticas.csv')).text()));
    } catch (err) {
      showToast('No se pudo cargar el catálogo sintético de cámaras', 'warning');
    }
  });
  document.getElementById('btn-generate-video-request')?.addEventListener('click', () => {
    const chosen = [...el.querySelectorAll('.video-event-check:checked')].map(c => keyEvents[+c.dataset.idx]);
    if (!chosen.length) {
      showToast('Elija al menos un evento para la solicitud', 'warning');
      return;
    }
    downloadVideoRequest(phone, chosen, +document.getElementById('video-window-min').value, +document.getElementById('video-radius-km').value, {
      nuc: document.getElementById('video-nuc')?.value.trim(),
      oficio: document.getElementById('video-oficio')?.value.trim(),
      dependencia: document.getElementById('video-dependencia')?.value.trim()
    });
  });
}

function windowText(rec, minutes) {
  const t = ts(rec);
  const from = toLocalParts(t - minutes * 60000);
  const to = toLocalParts(t + minutes * 60000);
  return from.date === to.date
    ? `${from.date.split('-').reverse().join('/')} de ${from.time.slice(0, 5)} a ${to.time.slice(0, 5)} h`
    : `${from.date.split('-').reverse().join('/')} ${from.time.slice(0, 5)} h al ${to.date.split('-').reverse().join('/')} ${to.time.slice(0, 5)} h`;
}

/**
 * Genera un .doc (HTML que Word abre) con el borrador del oficio. No se envía a ningún lado.
 */
function downloadVideoRequest(phone, chosen, windowMin, radiusKm, meta = {}) {
  const cameras = getCameraCatalog();
  const rows = chosen.map((k, i) => {
    const r = k.rec;
    const near = r.latitude != null
      ? cameras.map(c => ({ ...c, km: haversineKm(r.latitude, r.longitude, c.lat, c.lng) })).filter(c => c.km <= radiusKm).sort((a, b) => a.km - b.km)
      : [];
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(windowText(r, windowMin))}</td>
        <td>${escapeHtml(r.cell_id)}${r.latitude != null ? `<br>${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}` : '<br>sin coordenada'}</td>
        <td>${radiusKm} km</td>
        <td>${near.length ? near.map(c => `${escapeHtml(c.id)} (${escapeHtml(c.description)}, ${(c.km * 1000).toFixed(0)} m)`).join('<br>') : 'Las que existan en el radio indicado'}</td>
        <td>${escapeHtml(k.label)}${r.source_row ? `; renglón ${r.source_row} de ${escapeHtml(r.sheet_label || 'la sábana')}` : ''}</td>
      </tr>`;
  }).join('');

  const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Solicitud de videos</title>
    <style>body{font-family:Arial;font-size:11pt} table{border-collapse:collapse;width:100%} td,th{border:1px solid #444;padding:4px;font-size:9pt;vertical-align:top} .b{color:#b00;font-weight:bold}</style></head><body>
    <p class="b">BORRADOR GENERADO POR SABTEL — revisar, completar y firmar por el Ministerio Público. No enviar sin revisión.</p>
    <p>Ciudad Juárez, Chihuahua, a ${today}.</p>
    <p>OFICIO: ${escapeHtml(meta.oficio) || '______________'} &nbsp;&nbsp; CARPETA DE INVESTIGACIÓN / NUC: ${escapeHtml(meta.nuc) || '______________'}</p>
    <p>ASUNTO: Solicitud de preservación y entrega de videograbaciones.</p>
    <p>C. TITULAR DE ${escapeHtml(meta.dependencia) || '______________'} (C4 / VMS municipal / responsable de las cámaras)<br>P R E S E N T E</p>
    <p>Con fundamento en ______________ (artículos aplicables del Código Nacional de Procedimientos Penales y demás normativa), dentro de la carpeta de investigación citada al rubro, se solicita la <strong>preservación inmediata</strong> y posterior entrega, en formato original y con sus metadatos, de las videograbaciones captadas por las cámaras ubicadas dentro de los radios y en los periodos que se señalan:</p>
    <table><thead><tr><th>#</th><th>Periodo (hora de Ciudad Juárez)</th><th>Referencia (antena y coordenadas de catálogo)</th><th>Radio</th><th>Cámaras de interés</th><th>Motivo / fuente</th></tr></thead><tbody>${rows}</tbody></table>
    <p>Los puntos de referencia corresponden a la antena de telefonía que atendió eventos de la línea ${escapeHtml(formatPhoneNumber(phone))} según la sábana entregada por el operador. La antena indica un área de cobertura y no la ubicación exacta de una persona.</p>
    <p>Se solicita informar la hora del sistema de grabación respecto a la hora oficial, para corregir posibles desfases.</p>
    <p>ATENTAMENTE<br><br>______________________________<br>Agente del Ministerio Público</p>
    </body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BORRADOR_SOLICITUD_VIDEOS_${phone}_${toLocalParts(Date.now()).date}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Borrador de solicitud de videos generado. Revíselo antes de usarlo.', 'success');
}
