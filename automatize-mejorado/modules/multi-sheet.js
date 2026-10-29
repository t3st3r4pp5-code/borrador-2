/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/multi-sheet.js
 * Ingestión y Cruce Comparativo de Múltiples Sábanas Telefónicas
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDateTime, formatDuration, showToast } from '../utils.js';

export function initMultiSheetModule() {
  console.log('[MultiSheet] Inicializando comparador multi-sábana...');

  document.getElementById('btn-run-multisheet-cross')?.addEventListener('click', handleRunMultiSheetCross);
  document.getElementById('btn-load-preset-multisheet')?.addEventListener('click', handleLoadPresetMultiSheet);
}

export async function renderMultiSheetModule() {
  renderRegisteredSheetsList();
}

/**
 * Renderiza el listado de sábanas disponibles en la base de datos
 */
async function renderRegisteredSheetsList() {
  const container = document.getElementById('multisheet-list-container');
  if (!container) return;

  const records = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);

  // Agrupar registros por import_id o sheet_label
  const sheetsMap = {};
  records.forEach(r => {
    const key = r.sheet_label || r.import_id || 'Sábana Base Principal';
    if (!sheetsMap[key]) {
      sheetsMap[key] = {
        name: key,
        count: 0,
        expedition: r.expedition_id,
        hash: r.file_hash_sha256 || 'N/A',
        firstDate: r.event_datetime,
        lastDate: r.event_datetime,
        operators: new Set(),
        records: []
      };
    }
    sheetsMap[key].count++;
    sheetsMap[key].records.push(r);
    if (r.operator) sheetsMap[key].operators.add(r.operator);
  });

  const list = Object.values(sheetsMap);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info p-3">
        No hay sábanas registradas. Suba nuevas sábanas en la sección <strong>"Importar Sábana"</strong> 
        o presione <strong>"Cargar Caso Multi-Sábana de Ejemplo"</strong> para generar un cruce de 3 sábanas simultáneas.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="row g-3">
      ${list.map((sheet, idx) => `
        <div class="col-md-4">
          <div class="card h-100 border shadow-sm">
            <div class="card-body p-3">
              <div class="form-check mb-2">
                <input class="form-check-input multisheet-checkbox" type="checkbox" value="${sheet.name}" id="chk_sheet_${idx}" checked />
                <label class="form-check-label fw-bold text-navy" for="chk_sheet_${idx}">
                  ${sheet.name}
                </label>
              </div>
              <div class="small text-muted mb-2">
                <div>Expediente: <strong>${sheet.expedition || 'EXP-2026-084'}</strong></div>
                <div>Volumen: <span class="badge bg-secondary">${sheet.count} CDRs</span></div>
                <div>Operadores: ${Array.from(sheet.operators).join(', ')}</div>
              </div>
              <div class="text-truncate small text-muted">
                Hash: <code>${sheet.hash.substring(0, 16)}...</code>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Cruza las sábanas seleccionadas en busca de coincidencias directas, intermediarios y co-ubicación
 */
async function handleRunMultiSheetCross() {
  const selectedCheckboxes = Array.from(document.querySelectorAll('.multisheet-checkbox:checked')).map(cb => cb.value);

  if (selectedCheckboxes.length < 2) {
    showToast('Seleccione al menos 2 sábanas distintas para realizar el cruce forense.', 'warning');
    return;
  }

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);

  // Filtrar registros de las sábanas seleccionadas
  const sheetsData = {};
  selectedCheckboxes.forEach(label => {
    sheetsData[label] = allRecords.filter(r => (r.sheet_label || r.import_id || 'Sábana Base Principal') === label);
  });

  const crossResultsEl = document.getElementById('multisheet-results-container');
  if (!crossResultsEl) return;
  crossResultsEl.classList.remove('d-none');

  // 1. Números presentes en más de una sábana
  const numbersInSheets = {};
  selectedCheckboxes.forEach(label => {
    const set = new Set();
    sheetsData[label].forEach(r => {
      set.add(r.phone_origin);
      set.add(r.phone_destination);
    });
    numbersInSheets[label] = set;
  });

  // Intersección de números
  const allPhones = new Set();
  Object.values(numbersInSheets).forEach(set => set.forEach(p => allPhones.add(p)));

  const sharedPhones = [];
  allPhones.forEach(phone => {
    const presentIn = selectedCheckboxes.filter(label => numbersInSheets[label].has(phone));
    if (presentIn.length > 1) {
      sharedPhones.push({ phone, sheets: presentIn });
    }
  });

  // 2. Coincidencia de celdas y co-ubicación (antenas coincidentes)
  const antennasInSheets = {};
  selectedCheckboxes.forEach(label => {
    const map = new Map();
    sheetsData[label].forEach(r => {
      if (r.cell_id) {
        if (!map.has(r.cell_id)) map.set(r.cell_id, []);
        map.get(r.cell_id).push(r);
      }
    });
    antennasInSheets[label] = map;
  });

  const sharedAntennas = [];
  const allCellIds = new Set();
  Object.values(antennasInSheets).forEach(map => map.forEach((_, cell) => allCellIds.add(cell)));

  allCellIds.forEach(cell => {
    const presentIn = selectedCheckboxes.filter(label => antennasInSheets[label].has(cell));
    if (presentIn.length > 1) {
      sharedAntennas.push({ cell, sheets: presentIn });
    }
  });

  // Renderizar resultados del cruce
  crossResultsEl.innerHTML = `
    <!-- Matriz de Coincidencias -->
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <div class="card h-100 border shadow-sm">
          <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
            <span><i class="bi bi-person-lines-fill text-warning me-1"></i> Números Telefónicos Compartidos</span>
            <span class="badge bg-danger">${sharedPhones.length} Coincidencias</span>
          </div>
          <div class="card-body p-0" style="max-height: 280px; overflow-y: auto;">
            ${sharedPhones.length === 0 ? '<div class="p-3 text-muted text-center">No se encontraron números comunes entre las sábanas.</div>' : `
              <ul class="list-group list-group-flush">
                ${sharedPhones.map(sp => `
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong class="font-monospace text-navy">${formatPhoneNumber(sp.phone)}</strong>
                      <div class="small text-muted">Aparece en: ${sp.sheets.join(', ')}</div>
                    </div>
                    <button class="btn btn-xs btn-outline-primary py-0" onclick="window.quickAnalyze('${sp.phone}')">
                      Inspeccionar
                    </button>
                  </li>
                `).join('')}
              </ul>
            `}
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card h-100 border shadow-sm">
          <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
            <span><i class="bi bi-broadcast-pin text-info me-1"></i> Antenas y Celdas Coincidentes (Co-Ubicación)</span>
            <span class="badge bg-warning text-dark">${sharedAntennas.length} Celdas Compartidas</span>
          </div>
          <div class="card-body p-0" style="max-height: 280px; overflow-y: auto;">
            ${sharedAntennas.length === 0 ? '<div class="p-3 text-muted text-center">No se detectaron antenas compartidas.</div>' : `
              <ul class="list-group list-group-flush">
                ${sharedAntennas.map(sa => `
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <code>${sa.cell}</code>
                      <div class="small text-muted">Registrada en: ${sa.sheets.join(', ')}</div>
                    </div>
                    <span class="badge bg-danger">Co-Ubicación Probable</span>
                  </li>
                `).join('')}
              </ul>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  showToast(`Cruce multi-sábana finalizado. ${sharedPhones.length} números comunes y ${sharedAntennas.length} celdas compartidas.`, 'success');
}

/**
 * Carga 3 sábanas sintéticas con vínculos cruzados reales para demostración inmediata
 */
async function handleLoadPresetMultiSheet() {
  const { generateJuarezDemoRecords, KEY_INVESTIGATION_TARGETS } = await import('../scripts/generate-fake-data.js');

  // Sábana 1: Sospechoso Principal (Cabecilla)
  const sheet1 = generateJuarezDemoRecords(120, 'EXP-2026-084-SEC').map(r => ({
    ...r,
    sheet_label: 'Sábana 1: Sospechoso Principal (El Jaguar)',
    phone_origin: Math.random() < 0.6 ? KEY_INVESTIGATION_TARGETS.SUSPECT_LEADER : r.phone_origin
  }));

  // Sábana 2: Teléfono de Rescate / Extorsión
  const sheet2 = generateJuarezDemoRecords(100, 'EXP-2026-084-SEC').map(r => ({
    ...r,
    sheet_label: 'Sábana 2: Teléfono de Rescate',
    phone_origin: Math.random() < 0.6 ? KEY_INVESTIGATION_TARGETS.SUSPECT_CALLER : r.phone_origin
  }));

  // Sábana 3: Familiar de la Víctima
  const sheet3 = generateJuarezDemoRecords(80, 'EXP-2026-084-SEC').map(r => ({
    ...r,
    sheet_label: 'Sábana 3: Teléfono Familiar Víctima',
    phone_destination: Math.random() < 0.6 ? KEY_INVESTIGATION_TARGETS.VICTIM_FAMILY : r.phone_destination
  }));

  await dbService.insertRecordsBatch([...sheet1, ...sheet2, ...sheet3]);
  showToast('Se han ingresado 3 sábanas diferenciadas para cruce comparativo.', 'success');
  renderRegisteredSheetsList();
  setTimeout(() => handleRunMultiSheetCross(), 400);
}
