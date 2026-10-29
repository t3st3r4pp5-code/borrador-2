/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/vehicle-id.js
 * Reconocimiento de vehículos: lectura de placa (OCR) y cruce con datos OSINT / REPUVE
 * ============================================================================
 *
 * Idea (Omar): procesar imágenes y leer la placa con OCR para identificar posibles vehículos
 * con los datos obtenidos por OSINT.
 *
 * Alcance honesto del MVP:
 * - La lectura de placa (OCR) se intenta con Tesseract.js en el navegador. Es un módulo
 *   EXPERIMENTAL: si no carga o la foto es de baja calidad, se captura la placa a mano.
 *   La detección automática del recuadro de la placa y el reconocimiento del vehículo
 *   (marca/modelo por imagen) quedan como ETAPA 2.
 * - La placa (leída o escrita) se cruza contra los vehículos de las fichas OSINT ya cargadas
 *   y, de forma SIMULADA, contra REPUVE (que no es fuente abierta: requiere acceso oficial).
 * Todo resultado es indicio para revisión del analista.
 */

import { OSINT_PRESETS } from './osint.js';
import { showToast, escapeHtml } from '../utils.js';

const TESSERACT_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
let currentImageDataUrl = '';

const normPlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function initVehicleModule() {
  console.log('[VehicleID] Inicializando reconocimiento de placas...');
}

export function renderVehicleModule() {
  const el = document.getElementById('vehicle-id-content');
  if (!el || el.dataset.ready) return;
  el.dataset.ready = '1';

  el.innerHTML = `
    <div class="alert alert-warning small py-2">
      <i class="bi bi-cone-striped me-1"></i> <strong>Módulo experimental.</strong> La lectura de placa (OCR) corre en el navegador y puede fallar con fotos de baja calidad; en ese caso capture la placa a mano. El reconocimiento del vehículo por imagen (marca/modelo) y la detección automática de la placa son de etapa 2.
    </div>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card-forensic p-3 h-100">
          <label class="form-label small fw-bold">1. Imagen del vehículo / placa</label>
          <input type="file" id="vehicle-image-input" accept="image/*" class="form-control form-control-sm mb-2" />
          <div id="vehicle-image-preview" class="text-center bg-light border rounded p-2 mb-2" style="min-height:160px; display:flex; align-items:center; justify-content:center;">
            <span class="text-muted small">Sin imagen</span>
          </div>
          <button id="btn-vehicle-ocr" class="btn btn-sm btn-primary" disabled><i class="bi bi-eye me-1"></i> Leer placa (OCR)</button>
          <span id="vehicle-ocr-status" class="small text-muted ms-2"></span>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card-forensic p-3 h-100">
          <label class="form-label small fw-bold" for="vehicle-plate-input">2. Placa (leída por OCR o escrita a mano)</label>
          <div class="input-group input-group-sm mb-2">
            <input type="text" id="vehicle-plate-input" class="form-control font-monospace text-uppercase" placeholder="Ej. DWU341C" />
            <button id="btn-vehicle-search" class="btn btn-success"><i class="bi bi-search me-1"></i> Buscar</button>
          </div>
          <div class="form-text mb-2">Se cruza contra las fichas OSINT cargadas y, de forma simulada, contra REPUVE.</div>
          <div id="vehicle-results"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('vehicle-image-input')?.addEventListener('change', handleImageSelected);
  document.getElementById('btn-vehicle-ocr')?.addEventListener('click', handleRunOcr);
  document.getElementById('btn-vehicle-search')?.addEventListener('click', handleSearchPlate);
  document.getElementById('vehicle-plate-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearchPlate(); });
}

function handleImageSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentImageDataUrl = reader.result;
    const prev = document.getElementById('vehicle-image-preview');
    if (prev) prev.innerHTML = `<img src="${currentImageDataUrl}" alt="vehículo" style="max-width:100%; max-height:240px;" />`;
    const btn = document.getElementById('btn-vehicle-ocr');
    if (btn) btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_CDN;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('no-tesseract'));
    document.head.appendChild(s);
  });
}

async function handleRunOcr() {
  if (!currentImageDataUrl) return;
  const status = document.getElementById('vehicle-ocr-status');
  const btn = document.getElementById('btn-vehicle-ocr');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Cargando motor OCR…';

  try {
    const Tesseract = await loadTesseract();
    if (status) status.textContent = 'Leyendo imagen…';
    const { data } = await Tesseract.recognize(currentImageDataUrl, 'eng', {
      logger: (m) => { if (status && m.status === 'recognizing text') status.textContent = `Leyendo… ${Math.round((m.progress || 0) * 100)}%`; }
    });
    // Se busca la línea con más pinta de placa mexicana (6-8 caracteres alfanuméricos)
    const candidates = (data.text || '').split(/\s+/).map(normPlate).filter(t => t.length >= 5 && t.length <= 8 && /\d/.test(t) && /[A-Z]/.test(t));
    const best = candidates.sort((a, b) => b.length - a.length)[0] || normPlate(data.text).slice(0, 8);
    const plateInput = document.getElementById('vehicle-plate-input');
    if (plateInput) plateInput.value = best;
    if (status) status.textContent = best ? `Texto reconocido: ${best} (verifique a mano)` : 'No se identificó una placa; capture a mano.';
    if (best) handleSearchPlate();
  } catch (err) {
    if (status) status.textContent = 'OCR no disponible sin conexión: capture la placa a mano.';
    showToast('El motor OCR no se pudo cargar. Escriba la placa a mano.', 'warning');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function handleSearchPlate() {
  const plate = normPlate(document.getElementById('vehicle-plate-input')?.value);
  const out = document.getElementById('vehicle-results');
  if (!out) return;
  if (!plate || plate.length < 4) {
    out.innerHTML = '<div class="text-muted small">Escriba una placa para buscar.</div>';
    return;
  }

  // Cruce con los vehículos de las fichas OSINT cargadas (placa puede traer dos juegos "AAA111 / BBB222")
  const matches = [];
  OSINT_PRESETS.forEach(subj => {
    (subj.vehiculos || []).forEach(v => {
      const plates = String(v.placa || '').split('/').map(normPlate);
      const serie = normPlate(v.serie);
      if (plates.includes(plate) || (plate.length >= 11 && serie === plate)) {
        matches.push({ subj, v });
      }
    });
  });

  out.innerHTML = `
    ${matches.length ? `
      <div class="alert alert-success py-2 small mb-2"><strong>${matches.length}</strong> coincidencia(s) en las fichas OSINT cargadas.</div>
      ${matches.map(m => `
        <div class="border rounded p-2 mb-2 small">
          <div><strong>${escapeHtml(m.v.marca)} ${escapeHtml(m.v.linea)} ${escapeHtml(m.v.modelo)}</strong> · placa <span class="badge bg-secondary">${escapeHtml(m.v.placa)}</span></div>
          <div class="text-muted">VIN: <code>${escapeHtml(m.v.serie)}</code> · alta ${escapeHtml(m.v.alta)}</div>
          <div>Asociado a la ficha: <strong>${escapeHtml(m.subj.nombre)}</strong> (NUC ${escapeHtml(m.subj.nuc)})
            <button class="btn btn-xs btn-outline-primary py-0 ms-1" data-open-subject="${escapeHtml(m.subj.id)}">Ver ficha</button></div>
        </div>`).join('')}
    ` : `<div class="alert alert-secondary py-2 small mb-2">La placa <code>${escapeHtml(plate)}</code> no aparece en las fichas OSINT cargadas.</div>`}
    <div class="card border-warning">
      <div class="card-header bg-warning-subtle fw-bold small"><i class="bi bi-building-lock me-1"></i> REPUVE — consulta simulada (requiere acceso oficial)</div>
      <div class="card-body small">
        <p class="mb-1">REPUVE no es fuente abierta: requiere convenio y credenciales. En producción, con la placa <code>${escapeHtml(plate)}</code> se consultaría: propietario registrado, marca/modelo/año, estatus (robo, gravamen) y folio.</p>
        <button class="btn btn-sm btn-outline-secondary" disabled>Consultar REPUVE (requiere acceso oficial)</button>
      </div>
    </div>
    <p class="small text-muted mt-2 mb-0">Indicio para revisión: una placa leída por OCR puede tener errores; confírmela antes de actuar.</p>
  `;

  out.querySelectorAll('[data-open-subject]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open-subject');
      if (window.sabtelApp) {
        window.sabtelApp.switchView('osint');
        const sel = document.getElementById('osint-preset-select');
        if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
      }
    });
  });
}
