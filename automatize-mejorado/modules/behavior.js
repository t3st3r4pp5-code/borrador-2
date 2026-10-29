/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO: modules/behavior.js
 * Análisis Forense de Comportamientos Celulares y Patrones Delictivos
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDateTime, formatDuration, showToast, getLocalHour } from '../utils.js';

export function initBehaviorModule() {
  console.log('[Behavior] Inicializando motor de comportamientos celulares...');

  document.getElementById('btn-run-behavior-audit')?.addEventListener('click', handleRunBehaviorAudit);
}

export async function renderBehaviorModule() {
  handleRunBehaviorAudit();
}

async function handleRunBehaviorAudit() {
  const allRecords = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  if (!allRecords.length) return;

  const container = document.getElementById('behavior-analysis-container');
  if (!container) return;

  // 1. Detección de posibles Burner Phones (Teléfonos Desechables)
  // Agrupar por número
  const phoneStats = {};
  allRecords.forEach(r => {
    [r.phone_origin, r.phone_destination].forEach(p => {
      if (!p || p === 'DESCONOCIDO') return;
      if (!phoneStats[p]) {
        phoneStats[p] = {
          phone: p,
          total: 0,
          calls: 0,
          sms: 0,
          totalDuration: 0,
          dates: [],
          cells: new Set(),
          nightEvents: 0
        };
      }
      phoneStats[p].total++;
      if (r.event_type === 'llamada') {
        phoneStats[p].calls++;
        phoneStats[p].totalDuration += (parseInt(r.duration_seconds, 10) || 0);
      } else {
        phoneStats[p].sms++;
      }
      if (r.cell_id) phoneStats[p].cells.add(r.cell_id);

      const d = new Date(r.event_datetime);
      if (!isNaN(d.getTime())) {
        phoneStats[p].dates.push(d);
        const h = getLocalHour(d);
        if (h >= 0 && h <= 5) phoneStats[p].nightEvents++;
      }
    });
  });

  const burnerPhones = [];
  const nocturnalBursts = [];

  Object.values(phoneStats).forEach(stat => {
    if (stat.dates.length < 2) return;
    stat.dates.sort((a, b) => a - b);
    const firstDate = stat.dates[0];
    const lastDate = stat.dates[stat.dates.length - 1];
    const spanHours = (lastDate - firstDate) / (1000 * 3600);
    const avgDuration = stat.calls ? Math.round(stat.totalDuration / stat.calls) : 0;

    // Criterio Burner: Vida activa corta (< 72 hrs), llamadas breves (< 50 seg) y volumen moderado
    if (spanHours > 0 && spanHours <= 72 && avgDuration <= 55 && stat.total >= 4) {
      burnerPhones.push({
        phone: stat.phone,
        spanHours: spanHours.toFixed(1),
        avgDuration,
        total: stat.total,
        cellsCount: stat.cells.size,
        lastSeen: lastDate.toISOString()
      });
    }

    // Criterio Ráfaga Nocturna: más del 30% de sus comunicaciones en la madrugada
    if (stat.nightEvents >= 3 && (stat.nightEvents / stat.total) >= 0.25) {
      nocturnalBursts.push({
        phone: stat.phone,
        nightEvents: stat.nightEvents,
        total: stat.total,
        ratio: Math.round((stat.nightEvents / stat.total) * 100)
      });
    }
  });

  // Ordenar
  burnerPhones.sort((a, b) => b.total - a.total);
  nocturnalBursts.sort((a, b) => b.nightEvents - a.nightEvents);

  container.innerHTML = `
    <!-- ALERTA DE COMPORTAMIENTOS TÁCTICOS DETECTADOS -->
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <div class="card h-100 border-danger shadow-sm">
          <div class="card-header bg-danger text-white d-flex justify-content-between align-items-center">
            <span><i class="bi bi-fire me-1"></i> Líneas Desechables Identificadas (Burner Phones)</span>
            <span class="badge bg-light text-danger">${burnerPhones.length} Detectados</span>
          </div>
          <div class="card-body p-3">
            <p class="small text-muted mb-2">
              Patrón: Cese abrupto de tráfico, periodo activo menor a 72 horas y llamadas ultracortas para evitar geolocalización.
            </p>
            ${burnerPhones.length === 0 ? '<div class="text-muted p-2">No se detectaron patrones de desecho en esta ventana.</div>' : `
              <div class="table-responsive" style="max-height: 240px; overflow-y: auto;">
                <table class="table table-sm table-bordered small">
                  <thead class="table-light">
                    <tr>
                      <th>Línea Sospechosa</th>
                      <th>Vida Activa</th>
                      <th>Duración Prom.</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${burnerPhones.map(b => `
                      <tr>
                        <td class="fw-bold font-monospace text-navy">${formatPhoneNumber(b.phone)}</td>
                        <td>${b.spanHours} hrs</td>
                        <td>${formatDuration(b.avgDuration)}</td>
                        <td>
                          <button class="btn btn-xs btn-outline-danger py-0" onclick="window.quickAnalyze('${b.phone}')">
                            Perfil
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card h-100 border-warning shadow-sm">
          <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
            <span><i class="bi bi-moon-stars-fill text-warning me-1"></i> Ráfagas y Actividad Nocturna Anómala</span>
            <span class="badge bg-warning text-dark">${nocturnalBursts.length} Líneas</span>
          </div>
          <div class="card-body p-3">
            <p class="small text-muted mb-2">
              Patrón: Tráfico concentrado entre las 00:00 y las 05:00 horas (indicativo de presión psicológica, cobro de rescate o guardias).
            </p>
            ${nocturnalBursts.length === 0 ? '<div class="text-muted p-2">Sin actividad nocturna atípica.</div>' : `
              <div class="table-responsive" style="max-height: 240px; overflow-y: auto;">
                <table class="table table-sm table-bordered small">
                  <thead class="table-light">
                    <tr>
                      <th>Número Telefónico</th>
                      <th>Eventos Nocturnos</th>
                      <th>% del Tráfico</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${nocturnalBursts.map(n => `
                      <tr>
                        <td class="fw-bold font-monospace text-navy">${formatPhoneNumber(n.phone)}</td>
                        <td><span class="badge bg-danger">${n.nightEvents} llamadas/sms</span></td>
                        <td><strong>${n.ratio}%</strong> nocturno</td>
                        <td>
                          <button class="btn btn-xs btn-outline-primary py-0" onclick="window.quickAnalyze('${n.phone}')">
                            Auditar
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  showToast('Auditoría de comportamientos celulares completada.', 'info');
}
