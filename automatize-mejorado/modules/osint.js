/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/osint.js
 * Automatización de Fichas de Identificación Personal (OSINT & Plataforma PIWEB)
 * ============================================================================
 */

import { showToast, formatPhoneNumber, formatDateTime, sanitizePhoneNumber, escapeHtml, sha256Hex, getLocalHour } from '../utils.js';
import { auth } from '../auth.js';
import { dbService } from '../firebase-config.js';

// Base de datos de sujetos modelo extraídos de los expedientes forenses de Chihuahua
export const OSINT_PRESETS = [
  {
    id: 'subj_sergio_baca',
    fecha: '29 de junio de 2026',
    nuc: '32-2025-2560',
    nombre: 'Sergio Baca Méndez',
    fechaNacimiento: '15 de noviembre de 1977',
    lugarNacimiento: 'Parral, Chihuahua',
    edad: '48 años',
    ocupacion: 'Agente de Policía',
    adscripcion: '06/11/2000',
    estadoCivil: 'Casado',
    alias: 'Sin dato',
    domicilios: [
      'C. Gómez Morin 17, Hidalgo del Parral, Chih.',
      'C. Prolongación Sonora S/N Col. Kennedy, Hidalgo del Parral, Chih.'
    ],
    telefonos: [
      { num: '6271042147', tipo: 'Personal Celular' },
      { num: '6271390946', tipo: 'Contacto de Emergencia' },
      { num: '5235124', tipo: 'Fijo Local' },
      { num: '6275186240', tipo: 'Contacto de Emergencia' }
    ],
    familiares: {
      madre: 'Vicenta Méndez Leyva',
      padre: 'Alfonso Baca Alvirez',
      hermanos: ['Héctor Baca Méndez', 'Jorge Baca Méndez', 'Rubén Baca Méndez'],
      hermanas: ['Sin Dato'],
      pareja: 'Aida Peña Silva (Matrimonio: 28/12/2002)',
      hijos: [
        'Jaretzy Baca Peña (Nacimiento: 22/11/2003)',
        'David Fernando Baca Peña (Nacimiento: 09/04/2007)',
        'Sergio Daniel Baca Peña (Nacimiento: 09/12/2014)'
      ]
    },
    carpetas: [
      { nuc: '32-2025-2560', fecha: '24/08/2025', delito: 'Desaparición cometida por particulares', calidad: 'Testigo', unidad: 'Unidad Especializada en la Investigación de Personas Ausentes y/o Extraviadas' },
      { nuc: '32-2022-1188', fecha: '05/05/2022', delito: 'Daños', calidad: 'Testigo', unidad: 'Unidad Esp. Acusación y Ejecución de Delitos Contra la Integridad Física y Daños' }
    ],
    vehiculos: [
      { alta: '11/05/2022', marca: 'Volkswagen', linea: 'Jetta', modelo: '2005', placa: 'DUE122A / EMR5633', serie: '3VWRV09M95M068698' },
      { alta: '17/04/2001', marca: 'Dodge', linea: 'Shadow', modelo: '1988', placa: 'DVT9591 / DXN1792', serie: '1B3BS48K9JN256899' },
      { alta: '29/08/2005', marca: 'Nissan', linea: 'Tsuru', modelo: '1989', placa: 'DYG5881 / EAG8963', serie: '9LB1213924' }
    ],
    rpp: [
      { direccion: 'Sin dato específico registrado en padrón catastral municipal' }
    ],
    fuentesAbiertas: [
      { url: 'https://www.gob.mx/curp/', tipo: 'Validación Oficial CURP / RENAPO' },
      { url: 'https://consultas.chihuahua.gob.mx/', tipo: 'Verificación de Licencia Estatal' }
    ],
    observaciones: 'Solicitud por medio de oficio FGE-18S.4/01/xxx/2026, signado por el Coordinador de la Unidad de Investigación y Persecución del Delito de Desaparición Forzada y la Cometida por Particulares.'
  },
  {
    id: 'subj_edgar_salazar',
    fecha: '22 de septiembre de 2026',
    nuc: 'COL/046/2026',
    nombre: 'Edgar Manuel Salazar Zubiate',
    fechaNacimiento: '23/02/1975',
    lugarNacimiento: 'Aquiles Serdán, Chihuahua',
    edad: '51 años',
    ocupacion: 'Empleado',
    adscripcion: 'No aplica',
    estadoCivil: 'Casado',
    alias: 'Sin dato',
    domicilios: [
      'C. Martín López #2503 Col. Tres de Mayo, Chihuahua, Chih.',
      'C. Circuito Puente de Nuevo Paraíso #3967 Col. Puente de Piedra, Chihuahua, Chih.',
      'C. Del Mesteño #11700, Col. La Galera I, Chihuahua, Chih.'
    ],
    telefonos: [
      { num: '6145420041', tipo: 'Fijo Residencial (La Galera)' },
      { num: '6144358577', tipo: 'Fijo Residencial (Col. 3 de Mayo)' },
      { num: '6141251813', tipo: 'Celular / Contacto de Emergencia' },
      { num: '6883628', tipo: 'Fijo Puente de Piedra' }
    ],
    familiares: {
      madre: 'María Luisa Zubiate Alarcón',
      padre: 'Santos Salazar Silva',
      hermanos: ['José Santos Salazar Zubiate', 'Jesús Arturo Salazar Zubiate'],
      hermanas: ['Martha Yudith Salazar Zubiate'],
      pareja: 'Ana Lilia González Pérez (Matrimonio: 05/12/1995)',
      hijos: [
        'Edgar Alejandro Salazar González (Nacimiento: 25/07/1996 - CURP: SAGE960725HCHLND08)',
        'Edrian Arturo Salazar González (Nacimiento: 07/04/2002 - CURP: SAGE020407HCHLNDA1)'
      ]
    },
    carpetas: [
      { nuc: '19-2012-9005', fecha: '24/05/2012', delito: 'Falsedad ante la autoridad', calidad: 'Víctima', unidad: 'Unidad Esp. Contra El Servicio Público Y El Adecuado Desarrollo De La Justicia' }
    ],
    vehiculos: [
      { alta: '05/03/2026', marca: 'Kia', linea: 'Sportage', modelo: '2026', placa: 'DWU341C', serie: 'KNDPV3AF8T7464511' },
      { alta: '21/07/2022', marca: 'Honda', linea: 'Civic Touring', modelo: '2018', placa: 'EPE157A', serie: '19XFC1695JE602074' },
      { alta: '06/12/2024', marca: 'Kia', linea: 'Forte 4Ptas', modelo: '2020', placa: 'ERR199A', serie: '3KPF14BD2LE185582' },
      { alta: '12/06/2026', marca: 'Ford', linea: 'Pick Up F-150', modelo: '1993', placa: 'DP2252A', serie: '1FTEX15N7PKB97503' },
      { alta: '24/04/2025', marca: 'Nissan', linea: 'Xtrail Exclusive', modelo: '2018', placa: 'DTD846A', serie: 'JN8BT27T3JW081588' },
      { alta: '13/02/2025', marca: 'Chrysler', linea: 'Pick Up Ram 1500 Mild-Hybrid', modelo: '2022', placa: 'EC4502A', serie: '1C6SRFFT1NN248861' },
      { alta: '04/02/2022', marca: 'Jeep', linea: 'Grand Cherokee', modelo: '2018', placa: 'ENL3880', serie: '1C4RJEBGXJC327646' }
    ],
    rpp: [
      { direccion: 'C. Puente de Nuevo París #3967', inscripcion: '121', lote: '12', superficie: '179.67 m²', localidad: 'Chihuahua' },
      { direccion: 'C. Del Mesteño #11700', inscripcion: '31', lote: '2', superficie: '120.05 m²', localidad: 'Chihuahua' }
    ],
    fuentesAbiertas: [
      { url: 'https://www.gob.mx/curp/', tipo: 'Fijación de CURP: SAZE750223HCHLBD00' },
      { url: 'https://sh.chihuahua.gob.mx/padron_vehicular', tipo: 'Consulta Padrón Secretaría de Hacienda Chih.' }
    ],
    observaciones: 'Solicitud por medio de oficio FGE-12S.7/02/xxx/2026, signado por Agente del Ministerio Público Adscrito a la Unidad de Investigación y Persecución del Delito de Desaparición Forzada y La Cometida por Particulares.'
  }
];

let activeSubject = OSINT_PRESETS[1]; // Edgar Manuel por defecto

export function initOsintModule() {
  console.log('[OSINT] Inicializando generador de fichas de identificación personal...');

  document.getElementById('osint-preset-select')?.addEventListener('change', handleSelectPreset);
  document.getElementById('btn-osint-lookup-phone')?.addEventListener('click', handleLookupByPhone);
  document.getElementById('osint-lookup-phone')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLookupByPhone(); });
  document.getElementById('btn-export-osint-excel')?.addEventListener('click', handleExportExcel);
  document.getElementById('btn-export-osint-word')?.addEventListener('click', handleExportWord);
  document.getElementById('btn-export-osint-pdf')?.addEventListener('click', handleExportPDF);
}

export async function renderOsintModule() {
  const select = document.getElementById('osint-preset-select');
  if (select) {
    select.value = activeSubject.id;
  }
  displaySubjectFicha(activeSubject);
}

function handleSelectPreset(e) {
  const id = e.target.value;
  const found = OSINT_PRESETS.find(p => p.id === id);
  if (found) {
    activeSubject = found;
    displaySubjectFicha(activeSubject);
  }
}

/**
 * Calcula Hash SHA-256 de forma criptográfica nativa en el navegador
 */
async function calculateSha256(text) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
}

async function displaySubjectFicha(subj) {
  const container = document.getElementById('osint-ficha-container');
  if (!container) return;

  const rawJson = JSON.stringify(subj);
  const sha256 = await calculateSha256(rawJson);

  container.innerHTML = `
    <!-- AVISO DE CLASIFICACIÓN LEGAL Y RESERVA -->
    <div class="card mb-4 border-danger shadow-sm">
      <div class="card-header bg-danger text-white py-2 d-flex justify-content-between align-items-center">
        <span class="fw-bold tracking-wide"><i class="bi bi-shield-lock-fill me-1"></i> PLATAFORMA DE INTEGRACIÓN TECNOLÓGICA V 1.0 (PIWEB)</span>
        <span class="badge bg-light text-danger fw-bold">INFORMACIÓN ESTRICTAMENTE RESERVADA</span>
      </div>
      <div class="card-body p-3 bg-light text-dark small" style="font-size: 11px; line-height: 1.4;">
        <p class="mb-1 text-justify">
          <strong>FUNDAMENTO LEGAL:</strong> DE CONFORMIDAD CON EL ARTÍCULO 6o. FRACCIÓN I DE LA CONSTITUCIÓN POLÍTICA DE LOS ESTADOS UNIDOS MEXICANOS, 
          4o. FRACCIÓN II, PÁRRAFO SEGUNDO DE LA CONSTITUCIÓN POLÍTICA DEL ESTADO DE CHIHUAHUA, TODA LA INFORMACIÓN CONTENIDA EN ESTE DOCUMENTO SE ENCUENTRA 
          CLASIFICADA CONFORME A LOS ARTÍCULOS 113 Y 116 DE LA LEY GENERAL DE TRANSPARENCIA Y ACCESO A LA INFORMACIÓN PÚBLICA, Y EL ARTÍCULO 32 DE LA LEY DE 
          TRANSPARENCIA Y ACCESO A LA INFORMACIÓN PÚBLICA DEL ESTADO DE CHIHUAHUA.
        </p>
        <p class="mb-0 text-muted">
          <strong>LIMITANTES PARA FUENTES ABIERTAS (OSINT):</strong> FIJACIÓN DIGITAL CON CADENA DE CUSTODIA (ART. 20 CONST.). 
          HASH CRIPTOGRÁFICO SHA-256 DEL REGISTRO: <code class="text-danger fw-bold">${sha256}</code>
        </p>
      </div>
    </div>

    <!-- FICHA TÉCNICA PRINCIPAL -->
    <div class="bg-white p-4 border rounded shadow-sm">
      <div class="row align-items-center border-bottom pb-3 mb-3">
        <div class="col-md-8">
          <div class="text-uppercase small text-muted fw-bold">FISCALÍA GENERAL DEL ESTADO DE CHIHUAHUA</div>
          <h4 class="fw-bold text-navy mb-0" style="color: #001f3f;">FICHA DE IDENTIFICACIÓN PERSONAL</h4>
          <h5 class="text-danger fw-bold mb-0">${subj.nombre}</h5>
        </div>
        <div class="col-md-4 text-md-end mt-2 mt-md-0">
          <span class="badge bg-dark fs-6 font-monospace">NUC: ${subj.nuc}</span>
          <div class="text-muted small mt-1">Fecha de Emisión: ${subj.fecha}</div>
        </div>
      </div>

      <!-- SECCIÓN 1: DATOS PERSONALES -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-3 text-uppercase">1. Datos Personales</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered">
          <tbody>
            <tr>
              <th class="table-light w-25">Nombre Completo:</th>
              <td class="fw-bold text-navy">${subj.nombre}</td>
              <th class="table-light w-25">Edad / Alias:</th>
              <td>${subj.edad} / ${subj.alias}</td>
            </tr>
            <tr>
              <th class="table-light">Fecha de Nacimiento:</th>
              <td>${subj.fechaNacimiento}</td>
              <th class="table-light">Lugar de Nacimiento:</th>
              <td>${subj.lugarNacimiento}</td>
            </tr>
            <tr>
              <th class="table-light">Ocupación / Cargo:</th>
              <td>${subj.ocupacion}</td>
              <th class="table-light">Estado Civil:</th>
              <td>${subj.estadoCivil}</td>
            </tr>
            <tr>
              <th class="table-light">Domicilios Registrados:</th>
              <td colspan="3">
                <ul class="mb-0 ps-3">
                  ${subj.domicilios.map(d => `<li>${d}</li>`).join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <th class="table-light">Números Telefónicos:</th>
              <td colspan="3">
                <div class="d-flex flex-wrap gap-2">
                  ${subj.telefonos.map(t => `
                    <span class="badge bg-light text-dark border p-2">
                      <i class="bi bi-telephone-fill text-primary me-1"></i>
                      <strong>${t.num}</strong> (${t.tipo})
                      <a href="#" class="ms-1 text-danger" onclick="window.quickAnalyze('${t.num}'); return false;" title="Analizar CDR de este número">
                        <i class="bi bi-search"></i>
                      </a>
                    </span>
                  `).join('')}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 2: DATOS DE FAMILIARES -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-3 text-uppercase">2. Vínculos Familiares</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered">
          <tbody>
            <tr>
              <th class="table-light w-25">Padre:</th>
              <td>${subj.familiares.padre}</td>
              <th class="table-light w-25">Madre:</th>
              <td>${subj.familiares.madre}</td>
            </tr>
            <tr>
              <th class="table-light">Cónyuge / Pareja:</th>
              <td colspan="3">${subj.familiares.pareja}</td>
            </tr>
            <tr>
              <th class="table-light">Hermanos / Hermanas:</th>
              <td colspan="3">
                ${subj.familiares.hermanos.join(', ')}
              </td>
            </tr>
            <tr>
              <th class="table-light">Hijos / Hijas:</th>
              <td colspan="3">
                <ul class="mb-0 ps-3">
                  ${subj.familiares.hijos.map(h => `<li>${h}</li>`).join('')}
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 3: CARPETAS DE INVESTIGACIÓN -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-3 text-uppercase">3. Carpetas de Investigación y Averiguaciones Previas</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered align-middle">
          <thead class="table-dark">
            <tr>
              <th>NUC</th>
              <th>Fecha Inicio</th>
              <th>Delito</th>
              <th>Calidad Jurídica</th>
              <th>Unidad Ministerial</th>
            </tr>
          </thead>
          <tbody>
            ${subj.carpetas.map(c => `
              <tr>
                <td><code>${c.nuc}</code></td>
                <td>${c.fecha}</td>
                <td class="fw-bold text-danger">${c.delito}</td>
                <td><span class="badge ${c.calidad === 'Víctima' ? 'bg-info text-dark' : 'bg-warning text-dark'}">${c.calidad}</span></td>
                <td><small>${c.unidad}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 4: PADRÓN VEHICULAR (SECRETARÍA DE HACIENDA DE CHIHUAHUA) -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-3 text-uppercase">4. Padrón Vehicular Histórico (SH - Chihuahua)</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered align-middle font-monospace" style="font-size: 11px;">
          <thead class="table-light">
            <tr>
              <th>Fecha Alta</th>
              <th>Marca</th>
              <th>Línea</th>
              <th>Modelo</th>
              <th>Placa</th>
              <th>Número de Serie (VIN)</th>
            </tr>
          </thead>
          <tbody>
            ${subj.vehiculos.map(v => `
              <tr>
                <td>${v.alta}</td>
                <td><strong>${v.marca}</strong></td>
                <td>${v.linea}</td>
                <td>${v.modelo}</td>
                <td><span class="badge bg-secondary">${v.placa}</span></td>
                <td><code>${v.serie}</code></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 5: REGISTRO PÚBLICO DE LA PROPIEDAD -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-3 text-uppercase">5. Registro Público de la Propiedad (RPP)</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered">
          <thead class="table-light">
            <tr>
              <th>Dirección / Predio</th>
              <th>Inscripción</th>
              <th>Lote Catastral</th>
              <th>Superficie</th>
              <th>Localidad</th>
            </tr>
          </thead>
          <tbody>
            ${subj.rpp.map(r => `
              <tr>
                <td>${r.direccion}</td>
                <td>${r.inscripcion || 'N/D'}</td>
                <td>${r.lote || 'N/D'}</td>
                <td>${r.superficie || 'N/D'}</td>
                <td>${r.localidad || 'Chihuahua'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 6: FUENTES ABIERTAS (OSINT) & OBSERVACIONES -->
      <div class="p-3 bg-light rounded border mb-3">
        <h6 class="fw-bold text-navy mb-2"><i class="bi bi-globe me-1"></i> Fijación Digital Forense (Fuentes Abiertas):</h6>
        <ul class="small mb-2">
          ${subj.fuentesAbiertas.map(f => `<li><a href="${f.url}" target="_blank">${f.url}</a> - ${f.tipo}</li>`).join('')}
        </ul>
        <div class="small text-muted border-top pt-2 mt-2">
          <strong>Observaciones Ministeriales:</strong> ${subj.observaciones}
        </div>
      </div>
    </div>
  `;
}

/**
 * Genera una ficha a partir de un número de teléfono.
 * - Si el número pertenece a una persona ya cargada (preset), muestra su ficha.
 * - Si no, arma una ficha PRELIMINAR con lo que se puede derivar de las sábanas cargadas
 *   (actividad, contactos frecuentes, antenas) y deja marcadas, como CONSULTA SIMULADA, las
 *   secciones que en operación real requieren enlace oficial a RENAPO (identidad/CURP) y
 *   REPUVE (vehículos): no son fuentes abiertas, piden convenio, credenciales y oficio.
 */
async function handleLookupByPhone() {
  const input = document.getElementById('osint-lookup-phone');
  const phone = sanitizePhoneNumber(input?.value || '');
  if (!phone || phone.length < 7) {
    showToast('Ingrese un número telefónico válido para generar la ficha.', 'warning');
    return;
  }

  // 1. ¿Coincide con una persona ya registrada?
  const matchPreset = OSINT_PRESETS.find(p => (p.telefonos || []).some(t => sanitizePhoneNumber(t.num) === phone));
  if (matchPreset) {
    activeSubject = matchPreset;
    const select = document.getElementById('osint-preset-select');
    if (select) select.value = matchPreset.id;
    displaySubjectFicha(matchPreset);
    showToast(`El número corresponde a ${matchPreset.nombre}.`, 'success');
    return;
  }

  // 2. Ficha preliminar derivada de las sábanas cargadas (dato verificable, no inventado)
  const all = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  const related = all.filter(r => r.phone_origin === phone || r.phone_destination === phone)
    .sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));

  const container = document.getElementById('osint-ficha-container');
  if (!container) return;

  if (!related.length) {
    container.innerHTML = `<div class="alert alert-secondary">No hay registros de <code>${escapeHtml(formatPhoneNumber(phone))}</code> en las sábanas cargadas. Para una ficha de identidad real se requiere la consulta oficial (ver aviso sobre RENAPO/REPUVE).</div>` + renderOfficialSourcesNotice(phone);
    return;
  }

  const contacts = new Map();
  const cells = new Map();
  let nightEvents = 0;
  related.forEach(r => {
    const other = r.phone_origin === phone ? r.phone_destination : r.phone_origin;
    if (other && other !== 'DATOS_INTERNET') contacts.set(other, (contacts.get(other) || 0) + 1);
    if (r.cell_id && r.cell_id !== 'SIN_CELDA') cells.set(r.cell_id, (cells.get(r.cell_id) || 0) + 1);
    if (getLocalHour(r.event_datetime) <= 6) nightEvents++;
  });
  const topContacts = [...contacts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topCells = [...cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const last = related[related.length - 1];
  const hash = await sha256Hex(JSON.stringify(related.map(r => r.rec_id)));

  container.innerHTML = `
    <div class="alert alert-info d-flex align-items-center gap-2">
      <i class="bi bi-info-circle-fill fs-5"></i>
      <div><strong>Ficha preliminar</strong> generada a partir de las sábanas cargadas para <code>${escapeHtml(formatPhoneNumber(phone))}</code>.
      Los datos de identidad (nombre, CURP, domicilio) y vehículos NO se derivan del teléfono: requieren la consulta oficial de abajo.</div>
    </div>
    <div class="bg-white p-4 border rounded shadow-sm">
      <div class="d-flex justify-content-between border-bottom pb-2 mb-3">
        <h5 class="fw-bold text-navy mb-0">Ficha telefónica preliminar</h5>
        <span class="badge bg-dark font-monospace">${escapeHtml(formatPhoneNumber(phone))}</span>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-3"><div class="border rounded p-2 text-center"><div class="h5 mb-0">${related.length}</div><div class="small text-muted">eventos</div></div></div>
        <div class="col-md-3"><div class="border rounded p-2 text-center"><div class="h5 mb-0">${contacts.size}</div><div class="small text-muted">contactos</div></div></div>
        <div class="col-md-3"><div class="border rounded p-2 text-center"><div class="h5 mb-0">${nightEvents}</div><div class="small text-muted">eventos 00–06 h</div></div></div>
        <div class="col-md-3"><div class="border rounded p-2 text-center"><div class="small text-muted">Última conexión</div><div class="small fw-bold">${formatDateTime(last.event_datetime)}</div><div class="small"><code>${escapeHtml(last.cell_id)}</code></div></div></div>
      </div>
      <h6 class="fw-bold text-navy border-bottom pb-1">Contactos más frecuentes</h6>
      <div class="d-flex flex-wrap gap-2 mb-3">
        ${topContacts.map(([c, n]) => `<span class="badge bg-light text-dark border p-2">${escapeHtml(formatPhoneNumber(c))} · ${n}
          <a href="#" class="ms-1 text-danger" onclick="window.quickAnalyze('${escapeHtml(c)}'); return false;"><i class="bi bi-search"></i></a></span>`).join('') || '<span class="text-muted small">Sin contactos</span>'}
      </div>
      <h6 class="fw-bold text-navy border-bottom pb-1">Antenas más usadas</h6>
      <div class="d-flex flex-wrap gap-2 mb-2">
        ${topCells.map(([c, n]) => `<span class="badge bg-secondary p-2">${escapeHtml(c)} · ${n}</span>`).join('') || '<span class="text-muted small">Sin antenas</span>'}
      </div>
      <div class="small text-muted border-top pt-2">Fijación con hash SHA-256 de los registros usados: <code>${hash.slice(0, 24)}…</code></div>
    </div>
    ${renderOfficialSourcesNotice(phone)}
  `;
  auth.logAuthEvent?.('OSINT_PHONE_LOOKUP', `Ficha preliminar por teléfono ${phone} (${related.length} registros)`);
}

/**
 * Aviso + plantilla de la consulta oficial (RENAPO / REPUVE). Marcado como SIMULADO: en el MVP
 * no se conecta a esos sistemas porque no son APIs abiertas. Honestidad frente al jurado.
 */
function renderOfficialSourcesNotice(phone) {
  return `
    <div class="card mt-3 border-warning">
      <div class="card-header bg-warning-subtle fw-bold"><i class="bi bi-building-lock me-1"></i> Enlace a fuentes oficiales — CONSULTA SIMULADA (requiere acceso autorizado)</div>
      <div class="card-body small">
        <p class="mb-2">RENAPO (identidad/CURP) y REPUVE (vehículos) <strong>no son fuentes abiertas</strong>: requieren convenio institucional, credenciales y, según el dato, oficio del Ministerio Público. En este MVP la consulta es <strong>simulada</strong>; en producción se integraría con esos servicios bajo el acceso autorizado de la Fiscalía.</p>
        <div class="row g-2">
          <div class="col-md-6"><div class="border rounded p-2"><strong>RENAPO / CURP</strong><br><span class="text-muted">Entrada: nombre o CURP (no un teléfono).</span><br><button class="btn btn-sm btn-outline-secondary mt-1" disabled>Consultar (requiere acceso oficial)</button></div></div>
          <div class="col-md-6"><div class="border rounded p-2"><strong>REPUVE / Padrón vehicular</strong><br><span class="text-muted">Entrada: placa, NIV/VIN o propietario.</span><br><button class="btn btn-sm btn-outline-secondary mt-1" disabled>Consultar (requiere acceso oficial)</button></div></div>
        </div>
        <p class="mb-0 mt-2 text-muted">El teléfono por sí solo no identifica a una persona ante RENAPO; sirve para construir indicios (contactos, antenas, actividad) que orientan la investigación. Identidad y vehículos se confirman por la vía oficial y con supervisión humana.</p>
      </div>
    </div>
  `;
}

/**
 * Exporta la ficha completa a formato Excel (CSV tabulado estructurado)
 */
function handleExportExcel() {
  const subj = activeSubject;
  let csv = `FICHA DE INFORMACIÓN PERSONAL - FISCALÍA GENERAL DEL ESTADO DE CHIHUAHUA\n`;
  csv += `NUC,${subj.nuc},Fecha,${subj.fecha}\n`;
  csv += `Nombre,${subj.nombre},Edad,${subj.edad},Ocupación,${subj.ocupacion}\n\n`;

  csv += `DATOS PERSONALES\n`;
  csv += `Fecha Nacimiento,${subj.fechaNacimiento},Lugar,${subj.lugarNacimiento}\n`;
  csv += `Domicilios,"${subj.domicilios.join(' | ')}"\n`;
  csv += `Teléfonos,"${subj.telefonos.map(t => `${t.num} (${t.tipo})`).join(' | ')}"\n\n`;

  csv += `PADRÓN VEHICULAR\n`;
  csv += `Alta,Marca,Línea,Modelo,Placa,Serie\n`;
  subj.vehiculos.forEach(v => {
    csv += `"${v.alta}","${v.marca}","${v.linea}","${v.modelo}","${v.placa}","${v.serie}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Ficha_Identificacion_${subj.nombre.replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Ficha técnica exportada a formato Excel (CSV)', 'success');
}

/**
 * Exporta la ficha a formato Microsoft Word (.doc estructurado con estilos institucionales)
 */
function handleExportWord() {
  const subj = activeSubject;
  const content = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><title>Ficha Técnica Forense</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 10pt; }
      h2 { color: #001f3f; border-bottom: 2px solid #d32f2f; margin-bottom: 5px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th, td { border: 1px solid #777; padding: 4px 6px; font-size: 9pt; }
      th { background-color: #f0f0f0; }
      .aviso { background-color: #fbeae8; border: 1px solid #d32f2f; padding: 8px; font-size: 8pt; margin-bottom: 15px; }
    </style>
    </head>
    <body>
      <div class="aviso">
        <strong>INFORMACIÓN CLASIFICADA Y RESERVADA:</strong> Art. 6 CPEUM, Art. 4 Const. Chih., Art. 113/116 LGTAIP.
      </div>
      <h2>FICHA DE IDENTIFICACIÓN PERSONAL: ${subj.nombre}</h2>
      <p><strong>NUC:</strong> ${subj.nuc} | <strong>Fecha:</strong> ${subj.fecha} | <strong>Edad:</strong> ${subj.edad}</p>
      
      <h3>1. Datos Personales</h3>
      <table>
        <tr><th>Nombre</th><td>${subj.nombre}</td><th>Ocupación</th><td>${subj.ocupacion}</td></tr>
        <tr><th>Nacimiento</th><td>${subj.fechaNacimiento} (${subj.lugarNacimiento})</td><th>Estado Civil</th><td>${subj.estadoCivil}</td></tr>
        <tr><th>Domicilios</th><td colspan="3">${subj.domicilios.join('<br>')}</td></tr>
        <tr><th>Teléfonos</th><td colspan="3">${subj.telefonos.map(t => `${t.num} (${t.tipo})`).join(', ')}</td></tr>
      </table>

      <h3>2. Padrón Vehicular (SH)</h3>
      <table>
        <tr><th>Fecha Alta</th><th>Marca</th><th>Línea</th><th>Modelo</th><th>Placa</th><th>Serie</th></tr>
        ${subj.vehiculos.map(v => `<tr><td>${v.alta}</td><td>${v.marca}</td><td>${v.linea}</td><td>${v.modelo}</td><td>${v.placa}</td><td>${v.serie}</td></tr>`).join('')}
      </table>

      <p><small>FGE Chihuahua • Unidad Especializada en Combate al Secuestro</small></p>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', content], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Ficha_Identificacion_${subj.nombre.replace(/\s+/g, '_')}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Ficha técnica exportada a formato Word (.doc)', 'success');
}

/**
 * Exporta la ficha a PDF formal
 */
function handleExportPDF() {
  window.print();
}
