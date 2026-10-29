/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 7: modules/import.js
 * Asistente de Ingestión y Mapeo Universal Forense
 * Soporte Nativo: CSV (comas, punto y coma, tab), Excel (.xlsx, .xls), PDF Forense (.pdf), OCR
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { sanitizePhoneNumber, validateCoordinates, showToast, parseLocalDateTime, toLocalParts, sha256Hex, resolveAntenna, escapeHtml,
  getAntennaCatalog, saveAntennaCatalog, buildCatalogFromRows, learnCatalogFromRecords, exportCatalogCsv } from '../utils.js';
import { auth } from '../auth.js';

let rawParsedData = [];
let detectedHeaders = [];
let currentFileHashSHA256 = '';
let currentFileHashMD5 = '';
let currentFileName = '';
let currentFileSize = 0;
let detectedFormat = 'CSV';
let detectedTargetPhone = '';

let validatedRecords = [];
let validationSummary = { total: 0, valid: 0, duplicates: 0, invalidCoords: 0 };

export function initImportModule() {
  console.log('[Import] Inicializando motor universal de ingestión forense (CSV/Excel/PDF)...');

  // Input tradicional de archivo
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) processSelectedFile(file);
    });
  }

  // Zona Drag & Drop
  const dropZone = document.getElementById('import-drop-zone');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('border-primary', 'bg-white', 'shadow-sm');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-primary', 'bg-white', 'shadow-sm');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) {
        processSelectedFile(file);
      }
    }, false);
  }

  // Botón de procesar texto OCR / pegado
  const btnProcessOCR = document.getElementById('btn-process-ocr-text');
  if (btnProcessOCR) {
    btnProcessOCR.addEventListener('click', handleProcessOCRText);
  }

  // Botones de Mapeo y Confirmación
  const btnProcessMapping = document.getElementById('btn-process-mapping');
  if (btnProcessMapping) {
    btnProcessMapping.addEventListener('click', handleProcessMapping);
  }

  const btnConfirmImport = document.getElementById('btn-confirm-import');
  if (btnConfirmImport) {
    btnConfirmImport.addEventListener('click', handleConfirmImport);
  }

  // Botón Caso Muestra Juárez General
  const btnLoadSample = document.getElementById('btn-load-sample-sheet');
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', handleLoadSampleSheet);
  }

  // Botón Caso UAYC 6271218386 (Línea central + Interlocutores)
  const btnLoadSample627 = document.getElementById('btn-load-sample-627');
  if (btnLoadSample627) {
    btnLoadSample627.addEventListener('click', handleLoadSample627);
  }

  // Catálogo de antenas
  document.getElementById('catalog-file-input')?.addEventListener('change', handleCatalogFile);
  document.getElementById('btn-load-sample-catalog')?.addEventListener('click', handleLoadSampleCatalog);
  document.getElementById('btn-export-catalog')?.addEventListener('click', exportCatalogCsv);
  updateCatalogBadge();

  // Descarga de Plantilla CSV / Excel
  const btnDownloadTemplate = document.getElementById('btn-download-csv-template');
  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', handleDownloadTemplate);
  }
}

/**
 * ============================================================================
 * CATÁLOGO DE ANTENAS
 * ============================================================================
 */
function updateCatalogBadge() {
  const badge = document.getElementById('catalog-count-badge');
  if (badge) badge.textContent = `${Object.keys(getAntennaCatalog()).length} celdas`;
}

function mergeCatalogRows(rows, label) {
  const { catalog, skipped } = buildCatalogFromRows(rows);
  const merged = { ...getAntennaCatalog(), ...catalog };
  saveAntennaCatalog(merged);
  updateCatalogBadge();
  auth.logAuthEvent?.('CATALOG_LOADED', `${label}: ${Object.keys(catalog).length} celdas cargadas, ${skipped} renglones sin coordenada válida`);
  showToast(`Catálogo: ${Object.keys(catalog).length} celdas cargadas${skipped ? `, ${skipped} renglones omitidos` : ''}.`, 'success');
}

// Catálogo = CSV simple sin comillas; se usa PapaParse si cargó y un lector básico si no (sin conexión)
function parseCatalogText(text) {
  if (window.Papa) return window.Papa.parse(text, { header: true, skipEmptyLines: true }).data;
  const [headerLine, ...lines] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const headers = headerLine.split(',').map(h => h.trim());
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [headers[i], v.trim()])));
}

async function handleCatalogFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  mergeCatalogRows(parseCatalogText(await file.text()), file.name);
}

async function handleLoadSampleCatalog() {
  // Catálogo sintético: el del reto (celdas 4120-xxxxx) más las celdas usadas por los casos demo
  const { JUAREZ_CELL_TOWERS } = await import('../scripts/generate-fake-data.js');
  const demoRows = JUAREZ_CELL_TOWERS.map(t => ({ id_celda: t.cell_id, latitud: t.lat, longitud: t.lng, azimut: t.azimuth, nombre: t.site_name, fuente: 'Catálogo sintético demo' }));
  let reto = [];
  try {
    const text = await (await fetch('demo/catalogo_antenas_sintetico.csv')).text();
    reto = parseCatalogText(text);
  } catch (err) {
    console.warn('No se pudo leer el catálogo sintético del reto:', err);
  }
  mergeCatalogRows([...demoRows, ...reto], 'Catálogo sintético');
}

/**
 * Calcula Hash criptográfico SHA-256 y MD5 en el navegador (Web Crypto API)
 */
async function computeHashes(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    currentFileHashSHA256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Web Crypto no ofrece MD5; no se muestra un valor que no se calculó
    currentFileHashMD5 = 'N/D';
  } catch (e) {
    console.warn('Error calculando hash nativo:', e);
    currentFileHashSHA256 = 'ERROR_AL_CALCULAR_HASH';
    currentFileHashMD5 = 'N/D';
  }
}

/**
 * Orquestador principal de selección de archivo:
 * Detecta tipo (CSV, Excel XLSX/XLS, PDF) y delega al extractor correspondiente
 */
async function processSelectedFile(file) {
  if (!file) return;

  currentFileName = file.name;
  currentFileSize = file.size;

  // Extraer número de 10 dígitos del nombre del archivo si existe (ej. 6271218386.csv o 6271218386 finalizado.pdf)
  const phoneMatchInName = file.name.match(/\b(6\d{9}|[1-9]\d{9})\b/);
  if (phoneMatchInName) {
    detectedTargetPhone = phoneMatchInName[1];
    const targetInput = document.getElementById('import-target-phone');
    if (targetInput && !targetInput.value) {
      targetInput.value = detectedTargetPhone;
    }
  }

  // Auto-completar etiqueta de sábana
  const sheetLabelInput = document.getElementById('import-sheet-label');
  if (sheetLabelInput && !sheetLabelInput.value) {
    sheetLabelInput.value = file.name.replace(/\.[^/.]+$/, '');
  }

  const statusEl = document.getElementById('import-status-text');
  const sizeInfoEl = document.getElementById('import-file-size-info');
  const formatBadge = document.getElementById('import-detected-format-badge');

  if (sizeInfoEl) {
    sizeInfoEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  }

  if (statusEl) {
    statusEl.innerHTML = `
      <span class="spinner-border spinner-border-sm text-primary"></span> 
      Fijando cadena de custodia criptográfica y analizando: <strong>${file.name}</strong>...
    `;
  }

  // Fijación Forense Criptográfica inmediata (Cadena de Custodia CNPP)
  await computeHashes(file);

  const lowerName = file.name.toLowerCase();

  try {
    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
      detectedFormat = 'PDF';
      if (formatBadge) {
        formatBadge.className = 'badge bg-danger';
        formatBadge.textContent = 'Documento PDF Forense';
      }
      await parsePDFFile(file);
    } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel')) {
      detectedFormat = 'EXCEL';
      if (formatBadge) {
        formatBadge.className = 'badge bg-success';
        formatBadge.textContent = 'Libro Microsoft Excel';
      }
      await parseExcelFile(file);
    } else {
      // CSV, TXT, TSV o texto plano delimitado
      detectedFormat = 'CSV';
      if (formatBadge) {
        formatBadge.className = 'badge bg-primary';
        formatBadge.textContent = 'CSV / Archivo Delimitado';
      }
      await parseCSVFile(file);
    }
  } catch (err) {
    console.error('Error procesando archivo:', err);
    showToast(`Error al procesar el archivo: ${err.message}`, 'danger');
    if (statusEl) {
      statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> Error: ${err.message}</span>`;
    }
  }
}

/**
 * PARSER 1: ARCHIVOS CSV Y DE VALORES SEPARADOS POR COMA O PUNTO Y COMA (EXCEL)
 * - Auto-detecta delimitador: coma (,), punto y coma (;), tabulador (\t), pipe (|)
 * - Auto-detecta codificación (UTF-8, ISO-8859-1 / Windows-1252 con acentos)
 * - Salta metadatos o preámbulos institucionales antes del encabezado real
 */
async function parseCSVFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  
  // Decodificación con soporte de acentos en español (UTF-8 con fallback a Windows-1252)
  let text = '';
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    text = utf8Decoder.decode(arrayBuffer);
  } catch (e) {
    // Si contiene caracteres Latin-1 / Windows-1252 de Excel en español
    const latinDecoder = new TextDecoder('windows-1252');
    text = latinDecoder.decode(arrayBuffer);
  }

  // Limpiar BOM UTF-8 (\uFEFF)
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.substring(1);
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('El archivo está vacío.');
  }

  // Buscar la línea real de encabezados (saltar preámbulos como "Telcel", "Expediente: ...", etc.)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i].toLowerCase();
    const isHeaderCandidate = (
      (l.includes('tel') || l.includes('num') || l.includes('orig') || l.includes('ani') || l.includes('dest')) &&
      (l.includes('fech') || l.includes('date') || l.includes('hora') || l.includes('time') || l.includes('durac') || l.includes('tipo') || l.includes('sent') || l.includes('celd') || l.includes('antena'))
    );
    if (isHeaderCandidate) {
      headerIndex = i;
      break;
    }
  }

  // Detectar delimitador inspeccionando la línea de encabezados y primeras filas
  const sampleLines = lines.slice(headerIndex, headerIndex + 5);
  const delimCounts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  sampleLines.forEach(l => {
    delimCounts[','] += (l.match(/,/g) || []).length;
    delimCounts[';'] += (l.match(/;/g) || []).length;
    delimCounts['\t'] += (l.match(/\t/g) || []).length;
    delimCounts['|'] += (l.match(/\|/g) || []).length;
  });

  let bestDelim = ',';
  let maxCount = -1;
  Object.keys(delimCounts).forEach(d => {
    if (delimCounts[d] > maxCount) {
      maxCount = delimCounts[d];
      bestDelim = d;
    }
  });

  const cleanText = lines.slice(headerIndex).join('\n');

  if (window.Papa) {
    window.Papa.parse(cleanText, {
      header: true,
      skipEmptyLines: true,
      delimiter: bestDelim,
      transformHeader: (h) => h.trim().replace(/^["']|["']$/g, ''),
      complete: (results) => {
        handleExtractionSuccess(results.data, results.meta.fields || []);
      },
      error: (err) => {
        throw new Error(`Error en PapaParse: ${err.message}`);
      }
    });
  } else {
    // Parser fallback nativo
    const rows = parseDelimitedTextFallback(lines.slice(headerIndex), bestDelim);
    handleExtractionSuccess(rows.data, rows.headers);
  }
}

/**
 * PARSER 2: LIBROS DE MICROSOFT EXCEL (.XLSX / .XLS)
 * Utiliza SheetJS (window.XLSX) para procesar hojas nativas
 */
async function parseExcelFile(file) {
  if (!window.XLSX) {
    throw new Error('Biblioteca SheetJS (XLSX) no disponible. Verifique su conexión a internet.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El libro de Excel no contiene hojas de cálculo.');
  }

  // Tomar la primera hoja que contenga datos
  let sheetName = workbook.SheetNames[0];
  let sheet = workbook.Sheets[sheetName];

  // Convertir a matriz 2D
  const rawRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('La hoja de cálculo está vacía.');
  }

  // Buscar la fila de encabezados
  let headerIndex = 0;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const rowStr = rawRows[i].map(c => String(c).toLowerCase()).join(' ');
    if (
      (rowStr.includes('tel') || rowStr.includes('num') || rowStr.includes('orig') || rowStr.includes('dest') || rowStr.includes('llam')) &&
      (rowStr.includes('fech') || rowStr.includes('date') || rowStr.includes('hora') || rowStr.includes('durac') || rowStr.includes('tipo') || rowStr.includes('sent') || rowStr.includes('celd'))
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = rawRows[headerIndex].map(h => String(h || '').trim()).filter(h => h.length > 0);
  const dataRows = rawRows.slice(headerIndex + 1);

  const formattedData = [];
  dataRows.forEach(row => {
    if (!row || row.every(val => val === '' || val === null || val === undefined)) return;
    const obj = {};
    headers.forEach((h, idx) => {
      let val = row[idx];
      if (val instanceof Date) {
        val = val.toISOString();
      } else {
        val = String(val !== undefined && val !== null ? val : '').trim();
      }
      obj[h] = val;
    });
    formattedData.push(obj);
  });

  handleExtractionSuccess(formattedData, headers);
}

/**
 * PARSER 3: DOCUMENTOS PDF FORENSES (.PDF)
 * Utiliza PDF.js para extraer texto estructurado de sábanas y reportes i2/UAYC
 */
async function parsePDFFile(file) {
  if (!window.pdfjsLib) {
    throw new Error('Biblioteca PDF.js no disponible. Utilice la pestaña "Pegar Texto / OCR" como alternativa inmediata.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullExtractedLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Agrupar items por línea basándose en la posición Y
    const lineMap = new Map();
    textContent.items.forEach(item => {
      const y = Math.round(item.transform[5]); // Coordenada vertical Y
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y).push({ text: item.str, x: item.transform[4] });
    });

    // Ordenar de arriba hacia abajo (Y descendente)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    sortedY.forEach(y => {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      const lineText = items.map(it => it.text).join(' ').trim();
      if (lineText.length > 0) {
        fullExtractedLines.push(lineText);
      }
    });
  }

  // Estructurar líneas de PDF con analizador regex forense
  const extractedRows = extractCDRRecordsFromTextLines(fullExtractedLines, detectedTargetPhone);

  if (extractedRows.length === 0) {
    // Si no se detectaron patrones tabulares directos, alertar y permitir pegar en la pestaña OCR
    showToast(`El PDF contiene ${fullExtractedLines.length} líneas de texto pero no se detectaron filas de llamadas tabulares. Se cargó en la pestaña OCR para revisión asistida.`, 'warning');
    const ocrTextarea = document.getElementById('import-ocr-text');
    if (ocrTextarea) {
      ocrTextarea.value = fullExtractedLines.join('\n');
    }
    const tabOCR = document.getElementById('tab-ocr-import');
    if (tabOCR) tabOCR.click();
    return;
  }

  const headers = ['FECHA_HORA', 'TELEFONO_INTERLOCUTOR', 'TIPO_EVENTO', 'DIRECCION', 'DURACION_SEG', 'CELDA', 'LATITUD', 'LONGITUD'];
  handleExtractionSuccess(extractedRows, headers);
}

/**
 * PARSER 4: PESTAÑA DE TEXTO / OCR FORENSE
 */
async function handleProcessOCRText() {
  const textarea = document.getElementById('import-ocr-text');
  const targetInput = document.getElementById('import-ocr-target');
  const rawText = (textarea?.value || '').trim();
  const target = (targetInput?.value || '').trim();

  if (!rawText) {
    showToast('Por favor pegue el texto o reporte escaneado para procesar', 'warning');
    return;
  }

  currentFileName = `OCR_EXTRACCION_${Date.now()}.txt`;
  currentFileSize = rawText.length;
  currentFileHashSHA256 = await sha256Hex(rawText);
  currentFileHashMD5 = 'N/D';

  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = extractCDRRecordsFromTextLines(lines, target);

  if (rows.length === 0) {
    showToast('No se pudieron identificar registros con fecha y número en el texto proporcionado.', 'warning');
    return;
  }

  const headers = ['FECHA_HORA', 'TELEFONO_INTERLOCUTOR', 'TIPO_EVENTO', 'DIRECCION', 'DURACION_SEG', 'CELDA', 'LATITUD', 'LONGITUD'];
  detectedFormat = 'OCR';
  handleExtractionSuccess(rows, headers);

  // Regresar a la pestaña de mapeo
  const tabFile = document.getElementById('tab-file-import');
  if (tabFile) tabFile.click();
}

/**
 * Motor de Expresiones Regulares Forense para extraer CDRs desde texto no estructurado o PDF
 */
function extractCDRRecordsFromTextLines(lines, targetPhone = '6271218386') {
  const records = [];
  const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})/;
  const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
  const phoneRegex = /\b(6\d{9}|[1-9]\d{9}|142323|47288|UNOTV(?:\.COM)?|BUZON|TELCEL)\b/i;
  const eventRegex = /\b(LL[-_]S|LL[-_]E|M[-_]S|M[-_]E|Datos|LL[-_]Transito|Saliente|Entrante|Llamada|SMS)\b/i;

  lines.forEach((line) => {
    const hasDate = dateRegex.test(line);
    const hasTime = timeRegex.test(line);

    if (hasDate && (hasTime || phoneRegex.test(line))) {
      const dateMatch = line.match(dateRegex);
      const timeMatch = line.match(timeRegex);
      const phoneMatches = Array.from(line.matchAll(new RegExp(phoneRegex, 'gi'))).map(m => m[0]);
      const eventMatch = line.match(eventRegex);
      
      // Buscar duración numérica
      const durMatch = line.match(/\b(\d{1,5})\s*(?:s|seg|min)?\b/);
      // Buscar coordenadas decimales
      const coordMatches = Array.from(line.matchAll(/-?\d{2,3}\.\d{3,7}/g)).map(m => parseFloat(m[0]));

      let fullDateStr = dateMatch ? dateMatch[0] : '';
      if (timeMatch) fullDateStr += ' ' + timeMatch[0];

      // Determinar número interlocutor
      let interlocutor = '6560000000';
      if (phoneMatches.length > 0) {
        interlocutor = phoneMatches.find(p => p !== targetPhone) || phoneMatches[0];
      }

      let evType = 'llamada';
      let direction = 'saliente';
      const evStr = eventMatch ? eventMatch[0].toUpperCase() : '';

      if (evStr.includes('LL-E') || evStr.includes('ENTRANTE')) {
        evType = 'llamada';
        direction = 'entrante';
      } else if (evStr.includes('LL-S') || evStr.includes('SALIENTE')) {
        evType = 'llamada';
        direction = 'saliente';
      } else if (evStr.includes('M-E')) {
        evType = 'sms';
        direction = 'entrante';
      } else if (evStr.includes('M-S')) {
        evType = 'sms';
        direction = 'saliente';
      } else if (evStr.includes('DATOS') || line.toLowerCase().includes('datos')) {
        evType = 'datos';
        direction = 'saliente';
        interlocutor = 'DATOS_INTERNET';
      }

      let lat = 31.6904;
      let lng = -106.4245;
      if (coordMatches.length >= 2) {
        const c1 = coordMatches[0];
        const c2 = coordMatches[1];
        if (c1 > 0 && c2 < 0) {
          lat = c1; lng = c2;
        } else if (c2 > 0 && c1 < 0) {
          lat = c2; lng = c1;
        }
      }

      records.push({
        FECHA_HORA: fullDateStr,
        TELEFONO_INTERLOCUTOR: interlocutor,
        TIPO_EVENTO: evType,
        DIRECCION: direction,
        DURACION_SEG: durMatch ? durMatch[1] : (evType === 'datos' ? '3600' : '60'),
        CELDA: 'JUAR-BTS-CENTRO',
        LATITUD: lat.toString(),
        LONGITUD: lng.toString()
      });
    }
  });

  return records;
}

/**
 * Recibe datos procesados exitosamente y renderiza el Paso 2
 */
function handleExtractionSuccess(data, headers) {
  rawParsedData = data;
  detectedHeaders = headers;

  if (!rawParsedData.length) {
    showToast('El archivo no contiene filas utilizables.', 'warning');
    return;
  }

  showToast(`¡Archivo procesado con éxito! Se extrajeron ${rawParsedData.length} registros y ${detectedHeaders.length} columnas.`, 'success');

  const statusEl = document.getElementById('import-status-text');
  if (statusEl) {
    statusEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill"></i> Sábana lista: <strong>${rawParsedData.length} filas</strong> detectadas.</span>`;
  }

  // Renderizar Paso 2 (Mapeo Inteligente)
  renderMappingStep();

  // Scroll suave hacia el paso 2
  const mappingSection = document.getElementById('import-step-mapping');
  if (mappingSection) {
    mappingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Ejecutar validación automática sin errores bloqueantes
  setTimeout(() => {
    handleProcessMapping();
  }, 350);
}

/**
 * Analizador heurístico de valores para auto-asignar campos con alta confianza
 */
function analyzeColumnHeuristics(header, sampleValues) {
  const hLower = header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Heurística de Número Origen
  const isPhonePattern = sampleValues.some(v => /^\+?52?\d{7,12}$/.test(String(v).replace(/\s+/g, '')));
  if (isPhonePattern) {
    if (hLower.includes('orig') || hLower.includes('call') || hLower.includes('ani') || hLower.includes('num_a') || hLower.includes('telefono_a') || hLower.includes('llamante')) {
      return { key: 'phone_origin', confidence: 0.98 };
    }
    if (hLower.includes('dest') || hLower.includes('b_num') || hLower.includes('callee') || hLower.includes('num_b') || hLower.includes('telefono_b') || hLower.includes('llamado')) {
      return { key: 'phone_destination', confidence: 0.98 };
    }
    if (hLower.includes('interlocutor') || hLower.includes('contacto') || hLower.includes('telefono') || hLower.includes('numero') || hLower.includes('linea')) {
      return { key: 'contact_phone', confidence: 0.92 };
    }
  }

  // Heurística de Fecha y Hora juntas
  const isDateTimePattern = sampleValues.some(v => /\d{2,4}[-/]\d{1,2}[-/]\d{2,4}.+\d{1,2}:\d{2}/.test(String(v)));
  if (isDateTimePattern || ((hLower.includes('fecha') || hLower.includes('date')) && (hLower.includes('hora') || hLower.includes('time')))) {
    return { key: 'event_datetime', confidence: 0.96 };
  }

  // Heurística de Fecha sola
  const isDatePattern = sampleValues.some(v => /\d{4}[-/]\d{2}[-/]\d{2}/.test(String(v)) || /\d{2}[-/]\d{2}[-/]\d{4}/.test(String(v)));
  if (isDatePattern || hLower === 'fecha' || hLower === 'date') {
    return { key: 'event_date', confidence: 0.94 };
  }

  // Heurística de Hora sola
  const isTimePattern = sampleValues.some(v => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(v).trim()));
  if (isTimePattern || hLower === 'hora' || hLower === 'time' || hLower === 'tiempo') {
    return { key: 'event_time', confidence: 0.94 };
  }

  // Heurística de Coordenadas Geográficas (Latitud y Longitud)
  const isLatPattern = sampleValues.some(v => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 20.0 && n <= 35.0; // Rango México / Chihuahua
  });
  if (isLatPattern && (hLower.includes('lat') || hLower.includes('y'))) {
    return { key: 'latitude', confidence: 0.96 };
  }

  const isLngPattern = sampleValues.some(v => {
    const n = parseFloat(v);
    return !isNaN(n) && n <= -95.0 && n >= -118.0; // Rango longitud México / Chihuahua
  });
  if (isLngPattern && (hLower.includes('lon') || hLower.includes('lng') || hLower.includes('x'))) {
    return { key: 'longitude', confidence: 0.96 };
  }

  // Heurística de Azimut
  const isAzimuthPattern = sampleValues.some(v => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0 && n <= 360;
  });
  if (isAzimuthPattern && (hLower.includes('azi') || hLower.includes('sect') || hLower.includes('ang'))) {
    return { key: 'azimuth', confidence: 0.92 };
  }

  // Heurística de Celda / Antena (Cell ID)
  if (hLower.includes('cell') || hLower.includes('celda') || hLower.includes('antena') || hLower.includes('bts') || hLower.includes('sitio') || hLower.includes('cgi')) {
    return { key: 'cell_id', confidence: 0.94 };
  }

  // Heurística de Duración
  if (hLower.includes('durac') || hLower.includes('duration') || hLower.includes('seg') || hLower.includes('sec')) {
    return { key: 'duration_seconds', confidence: 0.91 };
  }

  // Heurística de Operador
  if (hLower.includes('oper') || hLower.includes('carr') || hLower.includes('comp') || hLower.includes('prov')) {
    return { key: 'operator', confidence: 0.90 };
  }

  // Heurística de Sentido / Dirección (Entrante vs Saliente)
  if (hLower.includes('sent') || hLower.includes('dir') || hLower.includes('in_out') || hLower.includes('traf')) {
    return { key: 'direction', confidence: 0.93 };
  }

  // Heurística de Tipo de Evento
  if (hLower.includes('tipo') || hLower.includes('type') || hLower.includes('serv') || hLower.includes('evento')) {
    return { key: 'event_type', confidence: 0.88 };
  }

  return { key: '', confidence: 0 };
}

/**
 * Renderiza el Paso 2: Mapeo inteligente con soporte de Esquema Dual
 */
function renderMappingStep() {
  const mappingSection = document.getElementById('import-step-mapping');
  if (mappingSection) mappingSection.classList.remove('d-none');

  const container = document.getElementById('column-mapping-container');
  if (!container) return;

  const sampleValuesMap = {};
  detectedHeaders.forEach(h => {
    sampleValuesMap[h] = rawParsedData.slice(0, 10).map(row => row[h]).filter(Boolean);
  });

  // Lista de campos forenses a mapear
  const fieldsToMap = [
    { key: 'phone_origin', label: '1. Número Origen (Llamante)', aliases: ['origen', 'caller', 'calling_number', 'num_origen', 'telefono_a', 'ani', 'origen_llamada'], help: 'Columna con el número que origina el evento' },
    { key: 'phone_destination', label: '2. Número Destino (Llamado)', aliases: ['destino', 'callee', 'called_number', 'num_destino', 'telefono_b', 'b_number', 'destino_llamada'], help: 'Columna con el número receptor' },
    { key: 'contact_phone', label: '3. Número Interlocutor (Modo 1 Línea)', aliases: ['interlocutor', 'contacto', 'telefono', 'numero', 'num', 'interlocutor_llamado'], help: 'Usado si la sábana solo tiene 1 columna de teléfono (Telcel/i2)' },
    { key: 'direction', label: '4. Sentido / Dirección (Entrante/Saliente/Datos)', aliases: ['sentido', 'direccion', 'direction', 'in_out', 'tipo_trafico', 'sent'], help: 'LL-S, LL-E, Saliente, Entrante, Datos, etc.' },
    { key: 'event_datetime', label: '5. Fecha y Hora Consolidada', aliases: ['fecha_hora', 'datetime', 'timestamp', 'fecha y hora', 'fechahora'], help: 'Fecha y hora en una sola columna' },
    { key: 'event_date', label: '6. Fecha Sola (si está separada)', aliases: ['fecha', 'date', 'fec'], help: 'Columna con la fecha del evento' },
    { key: 'event_time', label: '7. Hora Sola (si está separada)', aliases: ['hora', 'time', 'tiempo'], help: 'Columna con la hora del evento' },
    { key: 'duration_seconds', label: '8. Duración (Segundos)', aliases: ['duracion', 'duration', 'segundos', 'dur_sec', 'talk_time', 'dur'], help: 'Tiempo de llamada o sesión de datos' },
    { key: 'cell_id', label: '9. ID Antena / Celda (BTS)', aliases: ['cell_id', 'celda', 'antena', 'sitio', 'cgi', 'bts', 'id_celda'], help: 'Identificador de la antena celular' },
    { key: 'latitude', label: '10. Latitud Antena', aliases: ['latitud', 'latitude', 'lat', 'y'], help: 'Coordenada Y de la torre' },
    { key: 'longitude', label: '11. Longitud Antena', aliases: ['longitud', 'longitude', 'lng', 'lon', 'x'], help: 'Coordenada X de la torre' },
    { key: 'azimuth', label: '12. Azimut / Sector (°)', aliases: ['azimut', 'azimuth', 'sector', 'angulo', 'orientacion'], help: 'Ángulo de 0° a 360°' },
    { key: 'operator', label: '13. Operador / Concesionario', aliases: ['operador', 'carrier', 'compania', 'proveedor'], help: 'Telcel, AT&T, Movistar' },
    { key: 'event_type', label: '14. Tipo de Evento (Llamada/SMS/Datos)', aliases: ['tipo', 'type', 'tipo_evento', 'service_type', 'evento'], help: 'Llamada, SMS, Datos GPRS/LTE' }
  ];

  // Ejecutar auto-mapeo con normalización
  const autoMap = {};
  fieldsToMap.forEach(field => {
    let best = detectedHeaders.find(h => {
      const cleanH = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return field.aliases.some(alias => cleanH === alias || cleanH.includes(alias));
    });

    if (!best) {
      for (const h of detectedHeaders) {
        const heuristic = analyzeColumnHeuristics(h, sampleValuesMap[h]);
        if (heuristic.key === field.key && heuristic.confidence > 0.8) {
          best = h;
          break;
        }
      }
    }
    autoMap[field.key] = best || '';
  });

  // Renderizar campos de selección
  container.innerHTML = fieldsToMap.map(field => {
    const selectedHeader = autoMap[field.key] || '';
    const optionsHtml = ['<option value="">-- No mapear / Omitir --</option>']
      .concat(detectedHeaders.map(h => `<option value="${h}" ${h === selectedHeader ? 'selected' : ''}>${h}</option>`))
      .join('');

    const isMatched = !!selectedHeader;

    return `
      <div class="col-md-6 mb-2">
        <label class="form-label fw-bold text-navy small mb-1 d-flex justify-content-between">
          <span>${field.label}</span>
          ${isMatched ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i> Detectado</span>' : '<span class="text-muted">(Opcional)</span>'}
        </label>
        <select class="form-select form-select-sm mapping-select" data-schema-key="${field.key}">
          ${optionsHtml}
        </select>
        <div class="form-text text-muted" style="font-size: 10px;">${field.help}</div>
      </div>
    `;
  }).join('');

  // Mostrar información de fijación criptográfica
  const hashBox = document.getElementById('import-file-hash-info');
  if (hashBox) {
    hashBox.innerHTML = `
      <div class="p-3 bg-light border rounded small mt-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span><strong>Archivo:</strong> ${currentFileName} (${(currentFileSize / 1024).toFixed(1)} KB)</span>
          <span class="badge bg-dark font-monospace">CADENA DE CUSTODIA FIJADA (ARTS. 227-228 CNPP)</span>
        </div>
        <div class="text-truncate"><strong>SHA-256:</strong> <code class="text-danger font-monospace">${currentFileHashSHA256}</code></div>
        <div class="text-truncate"><strong>MD5:</strong> <code class="text-primary font-monospace">${currentFileHashMD5}</code></div>
      </div>
    `;
    hashBox.classList.remove('d-none');
  }

  // Vista previa de filas
  renderOriginalPreview();
}

function renderOriginalPreview() {
  const container = document.getElementById('import-raw-preview');
  const countBadge = document.getElementById('preview-row-count-badge');
  if (!container || !rawParsedData.length) return;

  if (countBadge) {
    countBadge.textContent = `${rawParsedData.length} registros`;
  }

  const previewRows = rawParsedData.slice(0, 5);
  const headers = detectedHeaders.slice(0, 8);

  let html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0 align-middle" style="font-size: 11px;">';
  html += '<thead class="table-dark"><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  previewRows.forEach(row => {
    html += '<tr>' + headers.map(h => `<td class="text-truncate" style="max-width: 140px;">${row[h] !== undefined ? row[h] : ''}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/**
 * Valida los registros y prepara el paso de confirmación
 * Soporta Esquema A (Origen + Destino) y Esquema B (Línea Objetivo + Interlocutor + Sentido)
 */
function handleProcessMapping() {
  const expeditionInput = document.getElementById('import-expedition-id');
  const sheetNameInput = document.getElementById('import-sheet-label');
  const targetPhoneInput = document.getElementById('import-target-phone');

  const expeditionId = (expeditionInput?.value || '').trim() || 'EXP-2026-084-SEC';
  const sheetLabel = (sheetNameInput?.value || '').trim() || currentFileName || 'Sábana Principal';
  let targetPhone = (targetPhoneInput?.value || '').trim() || detectedTargetPhone;

  // Si no hay targetPhone explícito pero se detecta en el nombre de archivo
  if (!targetPhone) {
    const match = currentFileName.match(/\b(6\d{9}|[1-9]\d{9})\b/);
    if (match) targetPhone = match[1];
  }

  // Obtener selecciones de mapeo
  const mapping = {};
  document.querySelectorAll('.mapping-select').forEach(select => {
    const key = select.getAttribute('data-schema-key');
    mapping[key] = select.value;
  });

  // Determinar esquema utilizado
  const hasOriginAndDest = mapping.phone_origin && mapping.phone_destination;
  const hasInterlocutor = mapping.contact_phone || mapping.phone_destination || mapping.phone_origin;

  if (!hasOriginAndDest && !hasInterlocutor) {
    showToast('Seleccione al menos una columna de teléfono para realizar la importación.', 'warning');
    return;
  }

  // Si no tiene origen y destino separados, se activa Esquema B (Línea Investigada + Interlocutor)
  const isSingleTargetScheme = !hasOriginAndDest && hasInterlocutor;
  if (isSingleTargetScheme && !targetPhone) {
    // Sin la línea titular no se puede saber el sentido de cada evento: no se asume un número
    showToast('Indique la línea investigada (titular de la sábana) antes de validar.', 'warning');
    targetPhoneInput?.focus();
    return;
  }

  // Titular de la sábana: la línea indicada o, en esquema origen/destino, el número presente en casi todos
  // los renglones. Sirve para saber de quién es la antena de cada evento.
  let sheetOwner = targetPhone ? sanitizePhoneNumber(targetPhone) : null;
  if (!sheetOwner && hasOriginAndDest && rawParsedData.length) {
    const freq = new Map();
    rawParsedData.forEach(row => {
      new Set([sanitizePhoneNumber(row[mapping.phone_origin]), sanitizePhoneNumber(row[mapping.phone_destination])])
        .forEach(n => { if (n && n !== 'DESCONOCIDO') freq.set(n, (freq.get(n) || 0) + 1); });
    });
    const [topNumber, topCount] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (topNumber && topCount / rawParsedData.length >= 0.9) sheetOwner = topNumber;
  }

  validatedRecords = [];
  const seenHashes = new Set();
  validationSummary = { total: rawParsedData.length, valid: 0, duplicates: 0, invalidCoords: 0, invalidDates: 0, resolvedByCatalog: 0, unresolvedCells: 0 };

  const importBatchId = 'imp_' + Date.now();

  // Si el encabezado de la columna de fecha indica UTC (p. ej. "Fecha y hora (UTC)"), se respeta esa zona
  const isUtcColumn = /utc/i.test(mapping.event_datetime || '') || /utc/i.test(mapping.event_date || '');

  rawParsedData.forEach((row, index) => {
    let origin = '';
    let destination = '';

    const rawDir = String(row[mapping.direction] || '').toLowerCase().trim();
    const rawType = String(row[mapping.event_type] || '').toLowerCase().trim();

    if (hasOriginAndDest) {
      // Esquema A: Dos números explícitos
      origin = sanitizePhoneNumber(row[mapping.phone_origin]);
      destination = sanitizePhoneNumber(row[mapping.phone_destination]);
    } else {
      // Esquema B: Línea Central Investigada + Interlocutor
      const interlocutorCol = mapping.contact_phone || mapping.phone_destination || mapping.phone_origin;
      const interlocutor = sanitizePhoneNumber(row[interlocutorCol]);

      const isIncoming = rawDir.includes('entrante') || rawDir.includes('ll-e') || rawDir.includes('m-e') || rawDir.includes('in');
      const isDataSession = rawDir.includes('datos') || rawType.includes('datos') || rawDir.includes('gprs') || rawDir.includes('lte');

      if (isDataSession) {
        origin = sanitizePhoneNumber(targetPhone);
        destination = 'DATOS_INTERNET';
      } else if (isIncoming) {
        origin = interlocutor;
        destination = sanitizePhoneNumber(targetPhone);
      } else {
        // Saliente o tránsito por defecto
        origin = sanitizePhoneNumber(targetPhone);
        destination = interlocutor;
      }
    }

    if (!origin || !destination) return;

    // Procesar fecha y hora
    let rawDateStr = '';
    if (mapping.event_datetime && row[mapping.event_datetime]) {
      rawDateStr = String(row[mapping.event_datetime]);
    } else if (mapping.event_date && row[mapping.event_date]) {
      rawDateStr = String(row[mapping.event_date]);
      if (mapping.event_time && row[mapping.event_time]) {
        rawDateStr += ' ' + row[mapping.event_time];
      }
    }

    // La hora de la sábana es hora local de Juárez; un renglón sin fecha válida se excluye y se cuenta
    const parsedDate = parseLocalDateTime(isUtcColumn && rawDateStr ? rawDateStr.trim().replace(' ', 'T') + 'Z' : rawDateStr);
    if (!parsedDate) {
      validationSummary.invalidDates++;
      return;
    }

    // Hash para descarte de duplicados exactos
    const hash = `${origin}_${destination}_${parsedDate.toISOString()}_${row[mapping.duration_seconds] || 0}`;
    if (seenHashes.has(hash)) {
      validationSummary.duplicates++;
      return;
    }
    seenHashes.add(hash);

    // Validar coordenadas geográficas
    const rawLat = row[mapping.latitude];
    const rawLng = row[mapping.longitude];
    const coordCheck = validateCoordinates(rawLat, rawLng);
    if (!coordCheck.valid && rawLat && rawLng) {
      validationSummary.invalidCoords++;
    }

    // Si la sábana no trae coordenadas, se buscan en el catálogo de antenas por identificador de celda
    const cellId = String(row[mapping.cell_id] ?? '').trim();
    let latitude = coordCheck.valid ? coordCheck.latitude : null;
    let longitude = coordCheck.valid ? coordCheck.longitude : null;
    let coordSource = coordCheck.valid ? 'sabana' : null;
    let catalogAzimuth = null;
    if (!coordCheck.valid) {
      const catalogEntry = resolveAntenna(cellId);
      if (catalogEntry) {
        latitude = catalogEntry.lat;
        longitude = catalogEntry.lng;
        catalogAzimuth = catalogEntry.azimuth;
        coordSource = 'catalogo';
        validationSummary.resolvedByCatalog++;
      } else {
        validationSummary.unresolvedCells++;
      }
    }
    const rawAzimuth = parseFloat(row[mapping.azimuth]);

    // Tipo de evento y dirección normalizada
    let finalEventType = 'llamada';
    if (rawType.includes('sms') || rawDir.includes('m-e') || rawDir.includes('m-s')) {
      finalEventType = 'sms';
    } else if (rawType.includes('datos') || rawDir.includes('datos') || destination === 'DATOS_INTERNET') {
      finalEventType = 'datos';
    }

    let finalDirection = 'saliente';
    if (rawDir.includes('entrante') || rawDir.includes('ll-e') || rawDir.includes('m-e')) {
      finalDirection = 'entrante';
    }

    validatedRecords.push({
      rec_id: `rec_${importBatchId}_${index}`,
      // Renglón del archivo original (1 = encabezado) para poder citar la fuente de cada hallazgo
      source_row: index + 2,
      target_phone: sheetOwner,
      import_id: importBatchId,
      sheet_label: sheetLabel,
      file_hash_sha256: currentFileHashSHA256,
      expedition_id: expeditionId,
      phone_origin: origin,
      phone_destination: destination,
      event_datetime: parsedDate.toISOString(),
      event_type: finalEventType,
      direction: finalDirection,
      duration_seconds: parseInt(row[mapping.duration_seconds], 10) || (finalEventType === 'datos' ? 3600 : 0),
      operator: row[mapping.operator] || 'Telcel',
      cell_id: cellId || 'SIN_CELDA',
      // null = sin coordenada: no se coloca en el mapa en lugar de inventar una ubicación
      latitude,
      longitude,
      coord_source: coordSource,
      azimuth: !isNaN(rawAzimuth) ? rawAzimuth : catalogAzimuth
    });
  });

  validationSummary.valid = validatedRecords.length;

  if (validationSummary.valid === 0) {
    showToast('No se generaron registros válidos con las columnas seleccionadas.', 'warning');
    return;
  }

  // Registrar metadatos de la sábana para multi-sábana
  registerSheetMetadata(importBatchId, sheetLabel, expeditionId, currentFileHashSHA256, validatedRecords.length);

  // Renderizar alerta de confirmación
  const validationAlert = document.getElementById('validation-summary-alert');
  if (validationAlert) {
    validationAlert.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0 fw-bold"><i class="bi bi-shield-check text-success fs-5 me-1"></i> Resumen de Validación Forense:</h6>
        <span class="badge bg-success">${validationSummary.valid} Registros Listos</span>
      </div>
      <ul class="mb-2 ps-3 small">
        <li><strong>${validationSummary.valid}</strong> eventos telefónicos estructurados para análisis y cruce.</li>
        <li><strong>${validationSummary.duplicates}</strong> registros duplicados descartados automáticamente.</li>
        ${validationSummary.invalidDates ? `<li class="text-danger"><strong>${validationSummary.invalidDates}</strong> renglones excluidos por fecha/hora ilegible (no se asume una fecha).</li>` : ''}
        <li><strong>${validationSummary.resolvedByCatalog}</strong> eventos ubicados con el catálogo de antenas; <strong>${validationSummary.unresolvedCells}</strong> sin coordenada (celda no encontrada en el catálogo, no se dibujan en el mapa).</li>
        <li><strong>Titular de la sábana:</strong> ${sheetOwner ? `<code>${escapeHtml(sheetOwner)}</code>` : '<span class="text-warning">no identificado (indique la línea investigada)</span>'}</li>
        <li><strong>Esquema Aplicado:</strong> ${isSingleTargetScheme ? `Línea Investigada (<code>${targetPhone}</code>) con interlocutores y ráfagas de datos` : 'Bipolar (Origen y Destino independientes)'}.</li>
        <li><strong>Causa Penal:</strong> <code>${escapeHtml(expeditionId)}</code> | Sábana: <strong>${escapeHtml(sheetLabel)}</strong></li>
        <li><strong>Hash SHA-256 Fijado:</strong> <code class="text-danger font-monospace">${currentFileHashSHA256.substring(0, 20)}...</code></li>
      </ul>
    `;
    validationAlert.classList.remove('d-none');
  }

  const confirmSection = document.getElementById('import-step-confirm');
  if (confirmSection) confirmSection.classList.remove('d-none');
}

/**
 * Guarda metadatos de la sábana para el comparador multi-sábana
 */
function registerSheetMetadata(batchId, label, expedition, hash, count) {
  try {
    const sheets = JSON.parse(localStorage.getItem('sabtel_registered_sheets') || '[]');
    sheets.push({
      id: batchId,
      label,
      expedition,
      hash,
      count,
      uploadedAt: new Date().toISOString(),
      user: auth.getCurrentUser()?.displayName || 'Perito de Telecomunicaciones'
    });
    localStorage.setItem('sabtel_registered_sheets', JSON.stringify(sheets));
  } catch (e) {
    console.warn('Error registrando sábana en localStorage:', e);
  }
}

/**
 * Guarda los registros en Firestore y almacén local
 */
async function handleConfirmImport() {
  if (!validatedRecords.length) {
    showToast('No hay registros validados para importar.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-confirm-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Indexando en base de datos...';
  }

  try {
    await dbService.insertRecordsBatch(validatedRecords);

    // Las celdas con coordenadas en esta sábana alimentan la base de antenas para futuras sábanas
    const learned = learnCatalogFromRecords(validatedRecords);
    updateCatalogBadge();
    if (learned.added || learned.conflicts.length) {
      showToast(`Base de antenas: ${learned.added} celdas nuevas aprendidas${learned.conflicts.length ? `; ${learned.conflicts.length} con ubicación distinta a la del catálogo (revisar: ${learned.conflicts.slice(0, 3).join(', ')})` : ''}.`, learned.conflicts.length ? 'warning' : 'info');
    }
    auth.logAuthEvent('IMPORT_SHEET_SUCCESS', `Importación exitosa de ${validatedRecords.length} registros para ${validatedRecords[0].sheet_label} con Hash ${currentFileHashSHA256.substring(0, 12)}`);
    showToast(`¡Importación completada! Se ingresaron ${validatedRecords.length} registros forenses.`, 'success');

    setTimeout(() => {
      if (window.sabtelApp) {
        window.sabtelApp.switchView('explorer');
      }
    }, 1000);
  } catch (err) {
    showToast(`Error al persistir registros: ${err.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-1"></i> Confirmar e Indexar Registros en SABTEL';
    }
  }
}

/**
 * Carga dataset sintético general de Ciudad Juárez
 */
async function handleLoadSampleSheet() {
  const { generateJuarezDemoRecords } = await import('../scripts/generate-fake-data.js');
  const demoData = generateJuarezDemoRecords(250);

  const keys = Object.keys(demoData[0]);
  const csvStr = [
    keys.join(','),
    ...demoData.map(d => keys.map(k => d[k]).join(','))
  ].join('\n');

  currentFileName = 'SABANA_MODELO_JUAREZ_2026.csv';
  currentFileSize = csvStr.length;
  currentFileHashSHA256 = await sha256Hex(csvStr);
  currentFileHashMD5 = 'N/D';

  if (window.Papa) {
    window.Papa.parse(csvStr, {
      header: true,
      complete: (res) => {
        handleExtractionSuccess(res.data, res.meta.fields || []);
      }
    });
  }
}

/**
 * Carga dataset específico del Caso UAYC 6271218386 (1 Línea central + Interlocutores + Sesiones de Datos 3600s)
 */
async function handleLoadSample627() {
  const { generateUAYC627CaseRecords } = await import('../scripts/generate-fake-data.js');
  const uaycRecords = generateUAYC627CaseRecords('EXP-2026-084-SEC');

  currentFileName = '6271218386_UAYC_EXTRAIDA.csv';
  currentFileSize = 0;
  currentFileHashSHA256 = await sha256Hex(JSON.stringify(uaycRecords));
  currentFileHashMD5 = 'N/D';
  detectedTargetPhone = '6271218386';

  const targetInput = document.getElementById('import-target-phone');
  if (targetInput) targetInput.value = detectedTargetPhone;

  // Convertir a formato tabular con 1 sola columna de teléfono y sentido (como en sábana Telcel real)
  const rows = uaycRecords.map(r => {
    const isOut = r.direction === 'saliente';
    const contact = isOut ? r.phone_destination : r.phone_origin;
    return {
      FECHA: toLocalParts(r.event_datetime).date,
      HORA: toLocalParts(r.event_datetime).time,
      NUMERO_INTERLOCUTOR: contact,
      SENTIDO: r.direction === 'entrante' ? 'LL-E' : (r.event_type === 'datos' ? 'DATOS' : 'LL-S'),
      TIPO: r.event_type,
      DURACION_SEG: r.duration_seconds,
      CELDA: r.cell_id,
      LATITUD: r.latitude,
      LONGITUD: r.longitude,
      AZIMUT: r.azimuth
    };
  });

  const headers = Object.keys(rows[0]);
  handleExtractionSuccess(rows, headers);
}

/**
 * Descarga una plantilla CSV compatible con Microsoft Excel (con BOM UTF-8 y delimitadores estándar)
 */
function handleDownloadTemplate() {
  const templateHeaders = [
    'NUMERO_ORIGEN',
    'NUMERO_DESTINO',
    'FECHA_HORA',
    'TIPO_EVENTO',
    'DIRECCION',
    'DURACION_SEGUNDOS',
    'OPERADOR',
    'ID_CELDA',
    'LATITUD',
    'LONGITUD',
    'AZIMUT'
  ];

  const sampleRows = [
    ['6271218386', '6271134588', '2025-01-22 11:44:49', 'llamada', 'saliente', '180', 'Telcel', 'JUAR-BTS-01_CENTRO', '31.7380', '-106.4850', '45'],
    ['6271134588', '6271218386', '2025-01-22 11:51:42', 'llamada', 'entrante', '45', 'Telcel', 'JUAR-BTS-01_CENTRO', '31.7380', '-106.4850', '45'],
    ['6271218386', 'DATOS_INTERNET', '2025-01-22 00:26:42', 'datos', 'saliente', '3600', 'Telcel', 'JUAR-BTS-04_PRONAF', '31.7225', '-106.4420', '120'],
    ['142323', '6271218386', '2025-01-22 08:18:11', 'sms', 'entrante', '0', 'Telcel', 'JUAR-BTS-04_PRONAF', '31.7225', '-106.4420', '120']
  ];

  const csvContent = '\uFEFF' + [
    templateHeaders.join(','),
    ...sampleRows.map(r => r.join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PLANTILLA_SABTEL_EXCEL_CSV.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Plantilla CSV descargada con éxito. Compatible con Microsoft Excel.', 'info');
}

/**
 * Parser de texto delimitado fallback puro JavaScript (sin dependencias externas)
 */
function parseDelimitedTextFallback(lines, delimiter = ',') {
  if (!lines.length) return { data: [], headers: [] };

  const parseLine = (text) => {
    const entries = [];
    let insideQuote = false;
    let entry = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === delimiter && !insideQuote) {
        entries.push(entry.trim().replace(/^["']|["']$/g, ''));
        entry = '';
      } else {
        entry += char;
      }
    }
    entries.push(entry.trim().replace(/^["']|["']$/g, ''));
    return entries;
  };

  const headers = parseLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const rowValues = parseLine(lines[i]);
    if (rowValues.length === 0 || (rowValues.length === 1 && !rowValues[0])) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = rowValues[idx] !== undefined ? rowValues[idx] : '';
    });
    data.push(obj);
  }

  return { data, headers };
}
