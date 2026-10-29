/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/network.js
 * Generador de Diagramas para Red de Vínculos Forenses (Estilo i2 Analyst's Notebook / UAYC)
 * ============================================================================
 * 
 * FORMATOS DE HOJA FORENSE SOPORTADOS:
 * 1. HOJA FORENSE RADIAL CON TRÁFICO DE DATOS (Muestra idéntica a Extracción i2):
 *    - Columna de Sesiones de Datos IP/GPRS (3600s, 7201s, etc.)
 *    - Red Radial de llamadas y SMS enlazados al blanco central (6271218386)
 *    - Llamadas salientes en Rojo (LL-S, LL-Tránsito) y entrantes en Azul (LL-E, M-E)
 *    - Marco oficial delimitador y pie de página "Página 1 de 1"
 * 
 * 2. DIAGRAMA COLUMNAR BIPOLAR (UAYC Estándar):
 *    - Simbología oficial y sello de la fiscalía
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDateTime, sanitizePhoneNumber, showToast, toLocalParts } from '../utils.js';

let networkTargetPhone = '6271218386'; // Número base del expediente del usuario (Chihuahua)

export function initNetworkModule() {
  console.log('[Network] Inicializando módulo de red de vínculos (i2/UAYC)...');

  document.getElementById('btn-render-network')?.addEventListener('click', handleRenderNetwork);
  document.getElementById('network-layout-format')?.addEventListener('change', handleRenderNetwork);
  document.getElementById('network-filter-criterion')?.addEventListener('change', handleRenderNetwork);
  document.getElementById('network-filter-traffic')?.addEventListener('change', handleRenderNetwork);
  document.getElementById('network-date-incident')?.addEventListener('change', handleRenderNetwork);
  document.getElementById('network-antenna-select')?.addEventListener('change', handleRenderNetwork);
  document.getElementById('btn-export-network-svg')?.addEventListener('click', handleExportSVG);
  document.getElementById('btn-export-network-png')?.addEventListener('click', handleExportPNG);
  document.getElementById('btn-export-network-pdf')?.addEventListener('click', handleExportPDF);
}

export async function renderNetworkDiagram() {
  const inputEl = document.getElementById('network-target-phone');
  if (inputEl && !inputEl.value) {
    inputEl.value = networkTargetPhone;
  }
  handleRenderNetwork();
}

async function handleRenderNetwork() {
  const phoneInput = document.getElementById('network-target-phone');
  networkTargetPhone = sanitizePhoneNumber(phoneInput?.value || '6271218386');

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);

  // Asegurar que si el número buscado es 6271218386 y no está en la base, inyectar el caso de prueba UAYC
  let targetRecords = allRecords.filter(r => 
    r.phone_origin === networkTargetPhone || r.phone_destination === networkTargetPhone
  );

  if (targetRecords.length === 0 && networkTargetPhone === '6271218386') {
    const uaycData = generateUAYCNetworkDataset();
    await dbService.insertRecordsBatch(uaycData);
    targetRecords = uaycData;
  }

  // Criterios de filtrado y formato
  const layoutFormat = document.getElementById('network-layout-format')?.value || 'radial_i2';
  const criterion = document.getElementById('network-filter-criterion')?.value || 'interactions';
  const trafficFilter = document.getElementById('network-filter-traffic')?.value || 'all';
  const incidentDate = document.getElementById('network-date-incident')?.value;
  const antennaFilter = document.getElementById('network-antenna-select')?.value;

  // Filtrar según tráfico (entrante/saliente)
  let filtered = targetRecords.filter(r => {
    // Si es datos no descartar en formato radial
    if (r.event_type === 'datos' && layoutFormat === 'radial_i2') return true;

    const isOutgoing = r.phone_origin === networkTargetPhone;
    if (trafficFilter === 'outgoing' && !isOutgoing) return false;
    if (trafficFilter === 'incoming' && isOutgoing) return false;

    // Filtro por fecha del hecho
    if (incidentDate && r.event_datetime) {
      const recDate = r.event_datetime.substring(0, 10);
      if (recDate !== incidentDate) return false;
    }

    // Filtro por antena
    if (antennaFilter && r.cell_id !== antennaFilter) return false;

    return true;
  });

  // Agrupar por contactos vinculados
  const linksMap = {};
  const dataSessions = [];

  filtered.forEach(r => {
    if (r.event_type === 'datos') {
      dataSessions.push(r);
      return;
    }

    const isOutgoing = r.phone_origin === networkTargetPhone;
    const contact = isOutgoing ? r.phone_destination : r.phone_origin;

    if (!linksMap[contact]) {
      linksMap[contact] = {
        phone: contact,
        total: 0,
        outgoingCalls: [],
        incomingCalls: [],
        incomingSms: [],
        outgoingSms: [],
        transits: [],
        antennas: new Set(),
        records: []
      };
    }

    linksMap[contact].total++;
    linksMap[contact].records.push(r);
    if (r.cell_id) linksMap[contact].antennas.add(r.cell_id);

    const timeLabel = formatDateTime(r.event_datetime);
    if (r.event_type === 'llamada') {
      if (r.isTransit) {
        linksMap[contact].transits.push(`LL-Transito ${timeLabel}`);
      } else if (isOutgoing) {
        linksMap[contact].outgoingCalls.push(`LL-S ${timeLabel}`);
      } else {
        linksMap[contact].incomingCalls.push(`LL-E ${timeLabel}`);
      }
    } else {
      if (isOutgoing) linksMap[contact].outgoingSms.push(`M-S ${timeLabel}`);
      else linksMap[contact].incomingSms.push(`M-E ${timeLabel}`);
    }
  });

  let contactsList = Object.values(linksMap);

  // Ordenar según el criterio seleccionado
  if (criterion === 'interactions') {
    contactsList.sort((a, b) => b.total - a.total);
  } else if (criterion === 'antennas') {
    contactsList.sort((a, b) => b.antennas.size - a.antennas.size);
  }

  // Popular selector de antenas
  populateAntennaSelector(targetRecords);

  // Renderizar según el formato elegido
  if (layoutFormat === 'radial_i2') {
    drawRadialI2Sheet(networkTargetPhone, contactsList, dataSessions);
  } else {
    drawBipolarUAYCDiagram(networkTargetPhone, contactsList, filtered);
  }
}

function populateAntennaSelector(records) {
  const select = document.getElementById('network-antenna-select');
  if (!select) return;

  const currentVal = select.value;
  const antennas = Array.from(new Set(records.map(r => r.cell_id).filter(Boolean)));

  select.innerHTML = '<option value="">Todas las Antenas</option>' + 
    antennas.map(a => `<option value="${a}" ${a === currentVal ? 'selected' : ''}>${a}</option>`).join('');
}

/**
 * ============================================================================
 * HOJA FORENSE RADIAL CON TRÁFICO DE DATOS (MUESTRA IDÉNTICA A EXTRACCIÓN i2)
 * ============================================================================
 */
function drawRadialI2Sheet(centerPhone, contactsList, dataSessions) {
  const container = document.getElementById('network-diagram-container');
  if (!container) return;

  const width = 1100;
  const height = 1500;
  const centerX = 550;
  const centerY = 750;

  // Sesiones de datos superiores e inferiores
  const topDataSessions = (dataSessions.length > 0 ? dataSessions : getSampleDataSessions()).slice(0, 24);
  const bottomDataSessions = (dataSessions.length > 0 ? dataSessions : getSampleDataSessions()).slice(24, 48);

  let svg = `
    <svg id="forensic-i2-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" 
         style="background-color: #ffffff; border: 1.5px solid #000000; font-family: Arial, sans-serif;">
      
      <!-- Marco exterior oficial de la hoja -->
      <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#000000" stroke-width="1.2" />

      <!-- Cascada Superior de Tráfico de Datos (GPRS / LTE) -->
      <g transform="translate(380, 25)">
        ${topDataSessions.map((ds, idx) => `
          <text x="0" y="${idx * 15}" font-size="9" fill="#000000" font-family="monospace">
            Datos ${formatDateRaw(ds.event_datetime)} ${ds.duration_seconds || 3600}
          </text>
        `).join('')}
      </g>

      <!-- ENLACES Y LÍNEAS VECTORIALES DE COMUNICACIÓN RADIAL -->
  `;

  // Colocar los nodos en disposición radial orgánica con radios variables
  const totalNodes = Math.max(contactsList.length, 1);
  const angleStep = (2 * Math.PI) / totalNodes;

  contactsList.forEach((node, idx) => {
    // Variación de radio para dar la dispersión orgánica de i2
    const radius = 170 + ((idx % 3) * 45);
    const angle = idx * angleStep - (Math.PI / 2);
    const nodeX = centerX + radius * Math.cos(angle);
    const nodeY = centerY + radius * Math.sin(angle);

    const isSpecial = ['UNOTV.COM', 'TELCEL', 'BUZON', 'internet.itelcel.com'].includes(node.phone);
    const isOutgoing = node.outgoingCalls.length > 0 || node.outgoingSms.length > 0;
    const strokeColor = isOutgoing ? '#d32f2f' : '#0d6efd';

    // Texto de evento representativo a lo largo del enlace
    const sampleEvent = node.transits[0] || node.outgoingCalls[0] || node.incomingCalls[0] || node.incomingSms[0] || 'LL 22/01/2025';
    const midX = (centerX + nodeX) / 2;
    const midY = (centerY + nodeY) / 2;

    svg += `
      <!-- Línea de conexión -->
      <line x1="${centerX}" y1="${centerY}" x2="${nodeX}" y2="${nodeY}" stroke="${strokeColor}" stroke-width="1.5" />
      
      <!-- Flecha de sentido saliente si aplica -->
      ${isOutgoing ? `
        <polygon points="${nodeX - 5},${nodeY - 3} ${nodeX},${nodeY} ${nodeX - 5},${nodeY + 3}" fill="${strokeColor}" />
      ` : ''}

      <!-- Etiqueta técnica sobre el enlace -->
      <text x="${midX}" y="${midY - 3}" font-size="8" fill="#111" font-family="monospace" text-anchor="middle"
            style="background: #fff;">
        ${sampleEvent}
      </text>

      <!-- Nodo periférico con ícono de teléfono e identificador -->
      <g transform="translate(${nodeX}, ${nodeY})" style="cursor: pointer;" onclick="window.quickAnalyze('${node.phone}')">
        <!-- Ícono estilizado de dispositivo -->
        <rect x="-8" y="-12" width="16" height="24" rx="2" fill="#5c4033" stroke="#000" stroke-width="0.8" />
        <rect x="-6" y="-10" width="12" height="16" fill="#fff" />
        <circle cx="0" cy="8" r="1.5" fill="#fff" />
        
        <!-- Etiqueta del número -->
        <text x="0" y="24" text-anchor="middle" font-size="9" font-weight="bold" fill="#000">${node.phone}</text>
      </g>
    `;
  });

  // NODO CENTRAL (TELÉFONO BLANCO)
  svg += `
    <g transform="translate(${centerX}, ${centerY})">
      <circle r="32" fill="#e1f5fe" stroke="#0288d1" stroke-width="2.5" />
      <!-- Ícono central de teléfono móvil -->
      <rect x="-9" y="-16" width="18" height="30" rx="3" fill="#263238" stroke="#000" stroke-width="1" />
      <rect x="-7" y="-14" width="14" height="22" fill="#fff" />
      <circle cx="0" cy="10" r="1.5" fill="#fff" />
      
      <text x="0" y="26" text-anchor="middle" font-size="11" font-weight="bold" fill="#000">${centerPhone}</text>
    </g>

    <!-- Cascada Inferior de Tráfico de Datos -->
    <g transform="translate(380, 1020)">
      ${bottomDataSessions.map((ds, idx) => `
        <text x="0" y="${idx * 15}" font-size="9" fill="#000000" font-family="monospace">
          Datos ${formatDateRaw(ds.event_datetime)} ${ds.duration_seconds || 3600}
        </text>
      `).join('')}
    </g>

    <!-- Pie de Página Institucional Oficial -->
    <text x="${centerX}" y="${height - 25}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#000000">
      Página 1 de 1
    </text>
  </svg>`;

  container.innerHTML = svg;

  const summaryEl = document.getElementById('network-stats-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <strong>Hoja de Extracción Forense i2:</strong> Línea <code>${centerPhone}</code> con 
      <strong>${contactsList.length} nodos radiales</strong> y <strong>${topDataSessions.length + bottomDataSessions.length} sesiones de datos</strong>.
    `;
  }
}

/**
 * ============================================================================
 * DIAGRAMA COLUMNAR BIPOLAR (UAYC ESTÁNDAR)
 * ============================================================================
 */
function drawBipolarUAYCDiagram(centerPhone, contactsList, totalRecords) {
  const container = document.getElementById('network-diagram-container');
  if (!container) return;

  const width = 1200;
  const height = Math.max(850, contactsList.length * 75);
  const centerX = width / 2;
  const centerY = height / 2;

  const leftSide = [];
  const rightSide = [];

  contactsList.forEach((c) => {
    const hasMoreOutgoing = c.outgoingCalls.length + c.outgoingSms.length >= c.incomingCalls.length + c.incomingSms.length;
    if (hasMoreOutgoing && leftSide.length < contactsList.length / 2 + 1) {
      leftSide.push(c);
    } else {
      rightSide.push(c);
    }
  });

  let svgHtml = `
    <svg id="forensic-i2-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" 
         style="background-color: #ffffff; border: 2px solid #333333; font-family: Arial, sans-serif;">
      
      <!-- Marco exterior oficial -->
      <rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="none" stroke="#000" stroke-width="1.5" />
      
      <!-- Título Superior Oficial -->
      <rect x="180" y="15" width="${width - 360}" height="45" fill="#f8f9fa" stroke="#333" stroke-width="1" rx="4" />
      <text x="${centerX}" y="32" text-anchor="middle" font-size="13" font-weight="bold" fill="#000">
        Red de vínculos de comunicación en llamadas y mensajes de texto
      </text>
      <text x="${centerX}" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#000">
        Línea telefónica blanco: ${formatPhoneNumber(centerPhone)}
      </text>

      <!-- Simbología Oficial -->
      <g transform="translate(40, ${height - 170})">
        <rect width="180" height="150" fill="#fff" stroke="#333" stroke-width="1" />
        <text x="90" y="18" text-anchor="middle" font-size="11" font-weight="bold" text-decoration="underline">Simbología</text>
        <circle cx="20" cy="35" r="4" fill="#d32f2f" />
        <text x="32" y="38" font-size="10" fill="#d32f2f" font-weight="bold">Rojo: Saliente</text>
        <circle cx="20" cy="52" r="4" fill="#0d6efd" />
        <text x="32" y="55" font-size="10" fill="#0d6efd" font-weight="bold">Azul: Entrante</text>
        <text x="15" y="72" font-size="9" fill="#333">LL-E: Llamada Entrante</text>
        <text x="15" y="86" font-size="9" fill="#333">LL-S: Llamada Saliente</text>
        <text x="15" y="100" font-size="9" fill="#333">M-E: Mensaje Entrante</text>
        <text x="15" y="114" font-size="9" fill="#333">M-S: Mensaje Saliente</text>
        <line x1="15" y1="128" x2="65" y2="128" stroke="#0d6efd" stroke-width="2" />
        <text x="75" y="131" font-size="8" fill="#555">Fecha / Hora</text>
      </g>

      <!-- Escudo Forense UAYC -->
      <g transform="translate(${width - 150}, ${height - 140})">
        <circle cx="50" cy="40" r="32" fill="#f0f4f8" stroke="#001f3f" stroke-width="2" />
        <text x="50" y="38" text-anchor="middle" font-size="14" font-weight="bold" fill="#001f3f">UAYC</text>
        <text x="50" y="50" text-anchor="middle" font-size="8" font-weight="bold" fill="#d32f2f">UECS CHIH</text>
        <rect x="25" y="80" width="50" height="15" fill="#333" rx="2" />
        <text x="50" y="91" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">A07 / CD</text>
      </g>

      <!-- NODO CENTRAL -->
      <g transform="translate(${centerX}, ${centerY})">
        <circle r="44" fill="#e1f5fe" stroke="#0288d1" stroke-width="3" />
        <circle r="36" fill="#ffffff" stroke="#01579b" stroke-width="1.5" />
        <text x="0" y="-8" text-anchor="middle" font-size="24">📱</text>
        <text x="0" y="14" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">${centerPhone}</text>
        <text x="0" y="24" text-anchor="middle" font-size="8" fill="#555">BLANCO</text>
      </g>
  `;

  // Columna Izquierda
  const leftStepY = (height - 200) / Math.max(leftSide.length, 1);
  leftSide.forEach((node, idx) => {
    const nodeX = 140;
    const nodeY = 120 + idx * leftStepY;
    const isSpecial = ['UNOTV.COM', 'TELCEL', 'BUZON'].includes(node.phone);
    const strokeColor = (node.outgoingCalls.length + node.outgoingSms.length > 0) ? '#d32f2f' : '#0d6efd';

    const timestamps = [...node.outgoingCalls, ...node.incomingCalls, ...node.incomingSms, ...node.outgoingSms].slice(0, 6);

    svgHtml += `
      <path d="M ${centerX - 44} ${centerY} L ${centerX - 140} ${nodeY} L ${nodeX + 35} ${nodeY}" 
            fill="none" stroke="${strokeColor}" stroke-width="1.8" />
      <polygon points="${nodeX + 42},${nodeY - 4} ${nodeX + 34},${nodeY} ${nodeX + 42},${nodeY + 4}" fill="${strokeColor}" />
      <text x="${centerX - 150}" y="${nodeY - 4}" text-anchor="end" font-size="8" fill="${strokeColor}" font-family="monospace">
        ${timestamps.join(' • ')}
      </text>
      <g transform="translate(${nodeX}, ${nodeY})" style="cursor: pointer;" onclick="window.quickAnalyze('${node.phone}')">
        <circle r="18" fill="#ffffff" stroke="${strokeColor}" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle" font-size="14">${isSpecial ? '🏢' : '📱'}</text>
        <text x="0" y="30" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">${node.phone}</text>
        <text x="0" y="40" text-anchor="middle" font-size="8" fill="#666">${node.total} eventos</text>
      </g>
    `;
  });

  // Columna Derecha
  const rightStepY = (height - 200) / Math.max(rightSide.length, 1);
  rightSide.forEach((node, idx) => {
    const nodeX = width - 140;
    const nodeY = 120 + idx * rightStepY;
    const isSpecial = ['UNOTV.COM', 'TELCEL', 'BUZON', '142323', '47288'].includes(node.phone);
    const strokeColor = (node.outgoingCalls.length > 0 && node.incomingCalls.length === 0) ? '#d32f2f' : '#0d6efd';

    const timestamps = [...node.incomingCalls, ...node.incomingSms, ...node.outgoingCalls, ...node.outgoingSms].slice(0, 6);

    svgHtml += `
      <path d="M ${centerX + 44} ${centerY} L ${centerX + 140} ${nodeY} L ${nodeX - 35} ${nodeY}" 
            fill="none" stroke="${strokeColor}" stroke-width="1.8" />
      <polygon points="${nodeX - 42},${nodeY - 4} ${nodeX - 34},${nodeY} ${nodeX - 42},${nodeY + 4}" fill="${strokeColor}" />
      <text x="${centerX + 150}" y="${nodeY - 4}" text-anchor="start" font-size="8" fill="${strokeColor}" font-family="monospace">
        ${timestamps.join(' • ')}
      </text>
      <g transform="translate(${nodeX}, ${nodeY})" style="cursor: pointer;" onclick="window.quickAnalyze('${node.phone}')">
        <circle r="18" fill="#ffffff" stroke="${strokeColor}" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle" font-size="14">${isSpecial ? '🏢' : '📱'}</text>
        <text x="0" y="30" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">${node.phone}</text>
        <text x="0" y="40" text-anchor="middle" font-size="8" fill="#666">${node.total} eventos</text>
      </g>
    `;
  });

  svgHtml += `
      <!-- Pie de página -->
      <text x="${centerX}" y="${height - 20}" text-anchor="middle" font-size="11" fill="#000000">Página 1 de 1</text>
    </svg>`;
  container.innerHTML = svgHtml;
}

/**
 * Coordenada y azimut sintéticos y estables para una celda de demostración
 */
function syntheticCellSite(cellId) {
  let h = 0;
  for (const ch of String(cellId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    latitude: 31.7380 + ((h % 1000) / 1000 - 0.5) * 0.05,
    longitude: -106.4850 + (((h >>> 10) % 1000) / 1000 - 0.5) * 0.05,
    azimuth: (h >>> 20) % 360
  };
}

function formatDateRaw(isoStr) {
  if (!isoStr) return '22/01/2025 00:26:42';
  try {
    const { date, time } = toLocalParts(isoStr);
    const [yr, mon, day] = date.split('-');
    return `${day}/${mon}/${yr} ${time}`;
  } catch (e) {
    return '22/01/2025 00:26:42';
  }
}

function getSampleDataSessions() {
  const dates = [
    '2025-01-22T00:26:42Z', '2025-01-22T00:45:32Z', '2025-01-22T01:02:19Z', '2025-01-22T01:22:59Z',
    '2025-01-22T08:18:04Z', '2025-01-22T09:30:05Z', '2025-01-22T09:45:14Z', '2025-01-22T10:45:14Z',
    '2025-01-22T11:45:15Z', '2025-01-22T12:53:58Z', '2025-01-22T13:53:58Z', '2025-01-22T15:14:19Z',
    '2025-01-22T18:49:05Z', '2025-01-23T23:31:50Z', '2025-01-24T00:31:50Z', '2025-01-24T01:31:50Z',
    '2025-01-24T02:31:50Z', '2025-01-24T04:31:51Z', '2025-01-24T05:31:51Z', '2025-01-24T06:31:51Z',
    '2025-01-24T07:31:51Z', '2025-01-24T08:31:51Z', '2025-01-24T09:31:51Z', '2025-01-24T10:31:51Z',
    '2025-01-30T01:30:07Z', '2025-01-30T02:30:07Z', '2025-01-30T03:30:07Z', '2025-01-30T04:52:50Z',
    '2025-01-30T07:08:54Z', '2025-01-30T08:57:18Z', '2025-01-30T09:58:50Z', '2025-01-30T14:44:05Z',
    '2025-01-30T16:26:41Z', '2025-01-30T16:26:41Z', '2025-01-31T16:07:43Z', '2025-01-31T17:07:43Z',
    '2025-01-31T18:07:43Z', '2025-01-31T18:18:28Z', '2025-01-31T18:27:25Z', '2025-01-31T18:31:53Z',
    '2025-01-31T19:31:53Z', '2025-01-31T20:57:12Z', '2025-01-31T21:57:12Z', '2025-01-31T23:19:59Z',
    '2025-01-31T23:32:47Z'
  ];

  return dates.map(d => ({
    event_datetime: d,
    event_type: 'datos',
    duration_seconds: [3600, 7201, 2357, 1426, 867, 706, 1971, 3600, 4024, 4911, 2585][Math.floor(Math.random() * 11)]
  }));
}

function handleExportSVG() {
  const svg = document.getElementById('forensic-i2-svg');
  if (!svg) {
    showToast('No hay diagrama generado para exportar', 'warning');
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Extraccion_i2_${networkTargetPhone}_P1_de_1.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Hoja forense i2 exportada en formato SVG vectorial', 'success');
}

function handleExportPNG() {
  const svg = document.getElementById('forensic-i2-svg');
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  canvas.width = svg.getAttribute('viewBox')?.split(' ')[2] || 1100;
  canvas.height = svg.getAttribute('viewBox')?.split(' ')[3] || 1500;

  img.onload = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `Extraccion_i2_${networkTargetPhone}_P1_de_1.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Hoja forense i2 exportada en PNG de alta resolución', 'success');
  };

  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

function handleExportPDF() {
  window.print();
}

/**
 * Genera el dataset correspondiente al caso real de Chihuahua / UAYC
 */
export function generateUAYCNetworkDataset() {
  const target = '6271218386';
  const contacts = [
    { phone: '6271134588', type: 'llamada', dir: 'saliente', count: 12, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: '6271474227', type: 'llamada', dir: 'saliente', count: 3, cell: 'CHIH-BTS-PARRAL-02', isTransit: true },
    { phone: '6271449752', type: 'llamada', dir: 'saliente', count: 2, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: '6271148264', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-PARRAL-03', isTransit: true },
    { phone: '6271231031', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-PARRAL-02', isTransit: false },
    { phone: '6271030501', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: '6271430295', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-PARRAL-01', isTransit: true },
    { phone: '6144517629', type: 'llamada', dir: 'entrante', count: 2, cell: 'CHIH-BTS-CENTRO-01', isTransit: true },
    { phone: '6144584689', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-CENTRO-02', isTransit: false },
    { phone: '6565901978', type: 'llamada', dir: 'entrante', count: 1, cell: 'JUAR-BTS-04_PRONAF', isTransit: false },
    { phone: '6144517677', type: 'llamada', dir: 'entrante', count: 2, cell: 'CHIH-BTS-CENTRO-01', isTransit: true },
    { phone: '6144517513', type: 'llamada', dir: 'entrante', count: 1, cell: 'CHIH-BTS-CENTRO-02', isTransit: false },
    { phone: '6144517525', type: 'llamada', dir: 'entrante', count: 2, cell: 'CHIH-BTS-CENTRO-01', isTransit: true },
    { phone: '6144584683', type: 'llamada', dir: 'saliente', count: 1, cell: 'CHIH-BTS-CENTRO-03', isTransit: false },
    { phone: 'UNOTV.COM', type: 'sms', dir: 'entrante', count: 18, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: 'TELCEL', type: 'sms', dir: 'entrante', count: 9, cell: 'CHIH-BTS-PARRAL-02', isTransit: false },
    { phone: 'BUZON', type: 'llamada', dir: 'entrante', count: 3, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: 'internet.itelcel.com', type: 'datos', dir: 'saliente', count: 8, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: '142323', type: 'sms', dir: 'entrante', count: 2, cell: 'CHIH-BTS-PARRAL-01', isTransit: false },
    { phone: '47288', type: 'sms', dir: 'entrante', count: 3, cell: 'CHIH-BTS-PARRAL-01', isTransit: false }
  ];

  const records = [];
  let id = 1000;

  contacts.forEach(c => {
    for (let i = 0; i < c.count; i++) {
      const isOut = c.dir === 'saliente';
      const d = new Date('2025-01-22T10:00:00Z');
      d.setHours(d.getHours() + (i * 14));

      records.push({
        rec_id: `rec_uayc_${id++}`,
        import_id: 'imp_uayc_case',
        expedition_id: 'NUC-32-2025-2560',
        phone_origin: isOut ? target : c.phone,
        phone_destination: isOut ? c.phone : target,
        event_datetime: d.toISOString(),
        event_type: c.type,
        direction: c.dir,
        duration_seconds: c.type === 'llamada' ? Math.floor(20 + Math.random() * 180) : 0,
        operator: 'Telcel',
        cell_id: c.cell,
        isTransit: c.isTransit,
        // Una misma celda siempre tiene la misma coordenada y azimut (sintéticos)
        ...syntheticCellSite(c.cell)
      });
    }
  });

  // Agregar sesiones de datos
  getSampleDataSessions().forEach(ds => {
    records.push({
      rec_id: `rec_uayc_${id++}`,
      import_id: 'imp_uayc_case',
      expedition_id: 'NUC-32-2025-2560',
      phone_origin: target,
      phone_destination: 'internet.itelcel.com',
      event_datetime: ds.event_datetime,
      event_type: 'datos',
      direction: 'saliente',
      duration_seconds: ds.duration_seconds,
      operator: 'Telcel',
      cell_id: 'CHIH-BTS-PARRAL-01',
      latitude: 31.7380,
      longitude: -106.4850,
      azimuth: 45
    });
  });

  return records;
}
