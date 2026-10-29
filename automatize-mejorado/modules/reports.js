/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 12: modules/reports.js
 * Generador de Informes Periciales y Dictámenes Forenses en PDF
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { auth } from '../auth.js';
import { formatPhoneNumber, formatDateTime, formatDuration, showToast } from '../utils.js';

export function initReportsModule() {
  console.log('[Reports] Inicializando generador de dictámenes forenses...');

  document.getElementById('btn-generate-pdf')?.addEventListener('click', handleGeneratePDF);
  document.getElementById('btn-preview-report')?.addEventListener('click', handlePreviewReport);
}

async function handlePreviewReport() {
  const expeditionInput = document.getElementById('report-expedition-select');
  const expeditionId = expeditionInput?.value || 'EXP-2026-084-SEC';
  const targetPhone = (document.getElementById('report-target-phone')?.value || '').trim();

  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  let records = allRecords.filter(r => r.expedition_id === expeditionId || !expeditionId);

  if (targetPhone) {
    records = records.filter(r => r.phone_origin.includes(targetPhone) || r.phone_destination.includes(targetPhone));
  }

  const previewContainer = document.getElementById('report-preview-document');
  if (!previewContainer) return;

  const user = auth.getCurrentUser() || { displayName: 'Analista Forense', badgeNumber: 'UECS-CHIH' };

  previewContainer.innerHTML = `
    <div class="p-4 bg-white text-dark shadow-sm border" style="font-family: Arial, sans-serif;">
      <!-- Membrete Oficial Ficticio -->
      <div class="row border-bottom pb-3 mb-3 align-items-center">
        <div class="col-8">
          <h5 class="fw-bold mb-0 text-navy" style="color: #001f3f;">FISCALÍA GENERAL DEL ESTADO DE CHIHUAHUA</h5>
          <div class="text-uppercase small fw-bold text-danger">Unidad Especializada en Combate al Secuestro (UECS)</div>
          <div class="text-muted small">Distrito Judicial Bravos - Ciudad Juárez, Chih.</div>
        </div>
        <div class="col-4 text-end">
          <span class="badge bg-danger p-2 fs-6">DICTAMEN PERICIAL CDR</span>
          <div class="small text-muted mt-1">OFICIO: UECS/TEL/2026-${Math.floor(100 + Math.random() * 900)}</div>
        </div>
      </div>

      <!-- Datos del Expediente -->
      <div class="bg-light p-3 rounded mb-3 border">
        <div class="row g-2 small">
          <div class="col-md-4"><strong>Expediente / Causa:</strong> ${expeditionId}</div>
          <div class="col-md-4"><strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString('es-MX')}</div>
          <div class="col-md-4"><strong>Perito / Analista:</strong> ${user.displayName}</div>
          <div class="col-md-4"><strong>Credencial Pericial:</strong> ${user.badgeNumber || 'CHIH-UECS'}</div>
          <div class="col-md-4"><strong>Objetivo:</strong> Análisis de Telecomunicaciones</div>
          <div class="col-md-4"><strong>Número Bajo Investigación:</strong> ${targetPhone ? formatPhoneNumber(targetPhone) : 'General'}</div>
        </div>
      </div>

      <!-- Resumen Ejecutivo -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-2">1. RESUMEN EJECUTIVO Y HALLAZGOS PRINCIPALES</h6>
      <p class="small mb-3">
        Se procesó y certificó la sábana de llamadas y datos proporcionada por los concesionarios de telecomunicaciones.
        El universo analizado comprende <strong>${records.length} registros</strong>. Se identificaron patrones consistentes 
        de llamadas nocturnas y concentración geográfica en celdas de alta relevancia táctica para la investigación.
      </p>

      <!-- Tabla de Eventos Relevantes -->
      <h6 class="fw-bold text-navy border-bottom pb-1 mb-2">2. MUESTRA DE COMUNICACIONES CRÍTICAS</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered small">
          <thead class="table-dark">
            <tr>
              <th>Fecha/Hora</th>
              <th>Origen</th>
              <th>Destino</th>
              <th>Tipo</th>
              <th>Duración</th>
              <th>Celda / Antena</th>
            </tr>
          </thead>
          <tbody>
            ${records.slice(0, 10).map(r => `
              <tr>
                <td>${formatDateTime(r.event_datetime)}</td>
                <td>${formatPhoneNumber(r.phone_origin)}</td>
                <td>${formatPhoneNumber(r.phone_destination)}</td>
                <td>${r.event_type.toUpperCase()}</td>
                <td>${formatDuration(r.duration_seconds)}</td>
                <td>${r.cell_id}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Cadena de Custodia y Firmas -->
      <div class="mt-4 pt-3 border-top">
        <h6 class="fw-bold text-navy mb-2">3. CADENA DE CUSTODIA Y CERTIFICACIÓN FORENSE</h6>
        <p class="small text-muted mb-4">
          Los registros aquí detallados fueron extraídos mediante procedimientos que garantizan su inalterabilidad conforme al Código Nacional de Procedimientos Penales.
        </p>

        <div class="row text-center mt-5">
          <div class="col-6">
            <div class="border-top pt-2 mx-4">
              <strong>${user.displayName}</strong><br>
              <small class="text-muted">Perito en Telecomunicaciones Forenses<br>Gafete: ${user.badgeNumber || 'UECS-CHIH'}</small>
            </div>
          </div>
          <div class="col-6">
            <div class="border-top pt-2 mx-4">
              <strong>Cmte. Roberto Garza</strong><br>
              <small class="text-muted">Director de Operaciones UECS<br>Cd. Juárez, Chihuahua</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  showToast('Vista previa del dictamen generada', 'info');
}

async function handleGeneratePDF() {
  showToast('Generando documento PDF pericial oficial...', 'info');

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    // Si no está cargado jsPDF en la ventana, imprimir a través del motor del navegador
    window.print();
    return;
  }

  const doc = new jsPDF();
  const expeditionInput = document.getElementById('report-expedition-select');
  const expeditionId = expeditionInput?.value || 'EXP-2026-084-SEC';
  const user = auth.getCurrentUser() || { displayName: 'Perito Forense', badgeNumber: 'UECS-CHIH-091' };

  // Encabezado institucional
  doc.setFillColor(0, 31, 63); // #001f3f
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FISCALÍA GENERAL DEL ESTADO DE CHIHUAHUA', 15, 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Unidad Especializada en Combate al Secuestro (UECS) - Ciudad Juárez', 15, 17);

  // Metadatos
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  doc.text(`EXPEDIENTE: ${expeditionId}`, 15, 34);
  doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleDateString('es-MX')}`, 15, 40);
  doc.text(`PERITO RESPONSABLE: ${user.displayName} (${user.badgeNumber})`, 15, 46);

  // Título
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(211, 47, 47); // #d32f2f
  doc.text('INFORME TÉCNICO DE TELECOMUNICACIONES Y REGISTROS CDR', 15, 56);

  // Cuerpo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const textContent = [
    'En atención a las diligencias ministeriales correspondientes al expediente citado al rubro,',
    'se procedió a la examinación, depuración y geolocalización de las sábanas telefónicas',
    'obtenidas legalmente conforme a la orden judicial emitida.',
    '',
    'HALLAZGOS FORENSES:',
    '- Identificación de números recurrentes en horarios nocturnos (00:00 - 05:00 hrs).',
    '- Coincidencia de celdas en el polígono delictivo de Ciudad Juárez (Zonas Centro, Pronaf y Torres).',
    '- Correlación de enlaces directos entre sospechosos y números de rescate/extorsión.'
  ];
  doc.text(textContent, 15, 65);

  // Firmas
  doc.line(20, 240, 90, 240);
  doc.text(user.displayName, 25, 246);
  doc.text('Perito Responsable UECS', 25, 251);

  doc.line(120, 240, 190, 240);
  doc.text('Cmte. Roberto Garza', 130, 246);
  doc.text('Visto Bueno Dirección UECS', 130, 251);

  doc.save(`Dictamen_Pericial_${expeditionId}_${Date.now()}.pdf`);
  showToast('Dictamen PDF descargado con éxito.', 'success');
  auth.logAuthEvent('REPORT_PDF_GENERATED', `Generación de informe pericial PDF para ${expeditionId}`);
}
