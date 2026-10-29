/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 4: utils.js
 * Funciones de Validación, Formateo Forense, Zona Horaria y Exportación
 * ============================================================================
 */

// Zona horaria de Ciudad Juárez. Desde 2022 la franja fronteriza sigue el horario de El Paso
// (hora de montaña con horario de verano de EE. UU.), no el del centro del país.
// 'America/Ciudad_Juarez' existe desde tzdata 2022g; si el navegador no la trae, America/Denver es equivalente.
export const DEFAULT_TIMEZONE = (() => {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Ciudad_Juarez' });
    return 'America/Ciudad_Juarez';
  } catch {
    return 'America/Denver';
  }
})();

// Límites geográficos de cobertura aproximada para Ciudad Juárez y zona fronteriza
export const JUAREZ_BOUNDS = {
  minLat: 31.4000,
  maxLat: 31.8500,
  minLng: -106.6500,
  maxLng: -106.2000
};

/**
 * Normaliza y valida números telefónicos asegurando formato TEXT (nunca número exponencial)
 * y preservando ladas locales de Ciudad Juárez (656, 614, etc.)
 */
export function sanitizePhoneNumber(phone) {
  if (phone === null || phone === undefined) return 'DESCONOCIDO';
  let str = String(phone).trim();
  // Eliminar caracteres no numéricos excepto el símbolo + inicial si existe
  str = str.replace(/[^\d+]/g, '');
  
  // Si comienza con 521 o 52, normalizar a formato estándar de 10 dígitos nacional
  if (str.startsWith('+52')) str = str.substring(3);
  if (str.startsWith('52') && str.length === 12) str = str.substring(2);

  return str || 'DESCONOCIDO';
}

/**
 * Da formato visual a un número de 10 dígitos (ej. (656) 123-4567)
 */
export function formatPhoneNumber(phone) {
  const clean = sanitizePhoneNumber(phone);
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return clean;
}

/**
 * Formatea fechas/horas en la zona horaria de Ciudad Juárez
 */
export function formatDateTime(isoOrDateStr) {
  if (!isoOrDateStr) return 'N/D';
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return String(isoOrDateStr);
    
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  } catch (e) {
    return String(isoOrDateStr);
  }
}

/**
 * Formatea duración en segundos a minutos y segundos (mm:ss o hh:mm:ss)
 */
export function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec === 0) return '0s (Intento/SMS)';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

/**
 * Valida si un par de coordenadas es numéricamente válido y pertenece a la región
 */
export function validateCoordinates(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    return { valid: false, reason: 'Coordenadas no numéricas o vacías' };
  }

  // Comprobar rango general de la tierra
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { valid: false, reason: 'Coordenadas fuera del rango global' };
  }

  // Comprobar si está en radio de Cd. Juárez
  const isJuarez = (
    latitude >= JUAREZ_BOUNDS.minLat &&
    latitude <= JUAREZ_BOUNDS.maxLat &&
    longitude >= JUAREZ_BOUNDS.minLng &&
    longitude <= JUAREZ_BOUNDS.maxLng
  );

  return {
    valid: true,
    isLocal: isJuarez,
    latitude,
    longitude
  };
}

/**
 * Obtiene el punto cardinal a partir de un azimut (0 - 360°)
 */
export function getAzimuthCardinal(degrees) {
  const deg = (parseFloat(degrees) % 360 + 360) % 360;
  if (isNaN(deg)) return 'Omni (360°)';
  
  const directions = [
    { label: 'Norte (N)', min: 337.5, max: 360 },
    { label: 'Norte (N)', min: 0, max: 22.5 },
    { label: 'Noreste (NE)', min: 22.5, max: 67.5 },
    { label: 'Este (E)', min: 67.5, max: 112.5 },
    { label: 'Sureste (SE)', min: 112.5, max: 157.5 },
    { label: 'Sur (S)', min: 157.5, max: 202.5 },
    { label: 'Suroeste (SO)', min: 202.5, max: 247.5 },
    { label: 'Oeste (O)', min: 247.5, max: 292.5 },
    { label: 'Noroeste (NO)', min: 292.5, max: 337.5 }
  ];

  for (const d of directions) {
    if (deg >= d.min && deg < d.max) {
      return `${deg}° - ${d.label}`;
    }
  }
  return `${deg}°`;
}

/**
 * Muestra alertas tipo Toast no intrusivas en la esquina del sistema
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('sabtel-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sabtel-toast-container';
    container.className = 'position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '99999';
    document.body.appendChild(container);
  }

  const bgClass = {
    success: 'bg-success text-white',
    danger: 'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info: 'bg-dark text-white'
  }[type] || 'bg-primary text-white';

  const toastId = 'toast_' + Date.now();
  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${bgClass} border-0 show shadow-lg mb-2`;
  toastEl.role = 'alert';
  toastEl.id = toastId;
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi bi-shield-fill-check"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
    </div>
  `;

  container.appendChild(toastEl);
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.remove(), 400);
  }, 4500);
}

/**
 * Exporta cualquier conjunto de registros a un archivo CSV estructurado
 */
export function exportToCSV(filename, rows) {
  if (!rows || !rows.length) {
    showToast('No hay registros disponibles para exportar', 'warning');
    return;
  }

  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : String(row[k]);
        cell = cell.replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Exportación completada: ${rows.length} registros`, 'success');
}

/**
 * Escapa texto antes de insertarlo con innerHTML (los valores vienen de archivos importados)
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Desfase en minutos de la zona horaria de Juárez respecto a UTC en un instante dado
 */
function juarezOffsetMinutes(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * Convierte fecha y hora "de pared" de la sábana (hora de Juárez, sin zona) a un Date correcto,
 * sin depender de la zona horaria de la computadora del analista. Devuelve null si no es válida.
 * Acepta YYYY-MM-DD[ T]HH:mm[:ss] y DD/MM/YYYY HH:mm[:ss]. Si el texto trae zona (Z o ±hh:mm) se respeta.
 */
export function parseLocalDateTime(raw) {
  const str = String(raw ?? '').trim();
  if (!str) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  let y, mo, d, h = 0, mi = 0, se = 0;
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) [h, mi, se] = [+m[4], +m[5], +(m[6] || 0)];
  } else {
    m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]];
    if (m[4] !== undefined) [h, mi, se] = [+m[4], +m[5], +(m[6] || 0)];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, se);
  // Rechaza fechas imposibles como 31/09 en lugar de recorrerlas al día siguiente
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Dos pasadas para resolver correctamente los cambios de horario de verano
  let utc = wall - juarezOffsetMinutes(wall) * 60000;
  utc = wall - juarezOffsetMinutes(utc) * 60000;
  return new Date(utc);
}

/**
 * Fecha (YYYY-MM-DD) y hora (HH:mm:ss) de pared en Ciudad Juárez, como las escribiría una sábana
 */
export function toLocalParts(isoOrDate) {
  const d = new Date(isoOrDate);
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(d).reduce((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

/**
 * Hora del día (0-23) en Ciudad Juárez, sin importar la zona de la computadora
 */
export function getLocalHour(isoOrDate) {
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return NaN;
  const h = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(d);
  return parseInt(h, 10);
}

/**
 * Distancia en km entre dos coordenadas (fórmula de Haversine)
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * SHA-256 en hexadecimal de un texto o ArrayBuffer
 */
export async function sha256Hex(data) {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ============================================================================
 * CATÁLOGO DE ANTENAS
 * Las sábanas suelen traer solo el identificador de celda. Las coordenadas salen de un catálogo
 * (del operador o de la unidad). Nunca se inventa una coordenada: si la celda no está, queda sin resolver.
 * ============================================================================
 */
const CATALOG_KEY = 'sabtel_antenna_catalog';

// Unifica separadores entre operadores: '5011/20047' y '5011-20047' son la misma celda
const normalizeCellId = (id) => String(id ?? '').trim().toUpperCase().replace(/[\/\s]+/g, '-');

export function getAntennaCatalog() {
  try {
    return JSON.parse(localStorage.getItem(CATALOG_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveAntennaCatalog(catalog) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

export function resolveAntenna(cellId) {
  const key = normalizeCellId(cellId);
  if (!key) return null;
  return getAntennaCatalog()[key] || null;
}

/**
 * Convierte filas de un CSV de catálogo (encabezados flexibles) a { CELDA: {lat, lng, azimuth, name, source} }
 */
export function buildCatalogFromRows(rows) {
  const pick = (row, names) => {
    const key = Object.keys(row).find(k => names.includes(k.trim().toLowerCase()));
    return key ? row[key] : undefined;
  };
  const catalog = {};
  let skipped = 0;
  rows.forEach(row => {
    const id = normalizeCellId(pick(row, ['id_celda', 'cell_id', 'celda', 'id_antena', 'cgi', 'sitio']));
    const lat = parseFloat(pick(row, ['latitud', 'latitude', 'lat']));
    const lng = parseFloat(pick(row, ['longitud', 'longitude', 'lng', 'lon']));
    if (!id || isNaN(lat) || isNaN(lng)) { skipped++; return; }
    const az = parseFloat(pick(row, ['azimut', 'azimuth']));
    catalog[id] = {
      lat,
      lng,
      azimuth: isNaN(az) ? null : az,
      name: pick(row, ['nombre', 'name', 'site_name']) || '',
      source: pick(row, ['fuente', 'source']) || 'Catálogo importado'
    };
  });
  return { catalog, skipped };
}

/**
 * Base de antenas que aprende de las sábanas: si una sábana sí trae coordenadas para una celda,
 * esa celda se agrega al catálogo y sirve para ubicar las sábanas que no las traen.
 * Si la celda ya existe con otra ubicación (> 200 m), se conserva la original y se reporta el conflicto.
 */
export function learnCatalogFromRecords(records) {
  const catalog = getAntennaCatalog();
  let added = 0;
  const conflicts = new Set();
  records.forEach(r => {
    if (r.coord_source !== 'sabana' || r.latitude == null || !r.cell_id || r.cell_id === 'SIN_CELDA') return;
    const key = normalizeCellId(r.cell_id);
    const existing = catalog[key];
    if (!existing) {
      catalog[key] = {
        lat: r.latitude,
        lng: r.longitude,
        azimuth: r.azimuth ?? null,
        name: '',
        source: `Aprendida de sábana: ${r.sheet_label || r.import_id || 'sin nombre'}`,
        learned_at: new Date().toISOString()
      };
      added++;
    } else if (haversineKm(existing.lat, existing.lng, r.latitude, r.longitude) > 0.2) {
      conflicts.add(key);
    }
  });
  saveAntennaCatalog(catalog);
  return { added, conflicts: [...conflicts] };
}

export function exportCatalogCsv() {
  const rows = Object.entries(getAntennaCatalog()).map(([id, c]) => ({
    id_celda: id, latitud: c.lat, longitud: c.lng, azimut: c.azimuth ?? '', nombre: c.name || '', fuente: c.source || ''
  }));
  exportToCSV('BASE_ANTENAS', rows);
}
