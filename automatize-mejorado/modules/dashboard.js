/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 6: modules/dashboard.js
 * Tablero de Control de Inteligencia y Resumen Ejecutivo Forense
 * ============================================================================
 */

import { dbService } from '../firebase-config.js';
import { formatPhoneNumber, formatDuration, getLocalHour } from '../utils.js';

let chartEventsInstance = null;
let chartHoursInstance = null;

export function initDashboard() {
  console.log('[Dashboard] Inicializando módulo de métricas...');
}

export async function renderDashboard() {
  const records = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);

  // 1. Calcular KPIs
  const totalRecords = records.length;
  const uniqueOrigins = new Set(records.map(r => r.phone_origin)).size;
  const uniqueDests = new Set(records.map(r => r.phone_destination)).size;
  const uniqueAntennas = new Set(records.filter(r => r.cell_id).map(r => r.cell_id)).size;
  const uniqueExpeditions = new Set(records.map(r => r.expedition_id)).size;

  // Actualizar elementos en DOM
  const kpiRecordsEl = document.getElementById('kpi-total-records');
  const kpiOriginsEl = document.getElementById('kpi-unique-origins');
  const kpiAntennasEl = document.getElementById('kpi-active-antennas');
  const kpiExpeditionsEl = document.getElementById('kpi-expeditions');

  if (kpiRecordsEl) kpiRecordsEl.textContent = totalRecords.toLocaleString();
  if (kpiOriginsEl) kpiOriginsEl.textContent = uniqueOrigins.toLocaleString();
  if (kpiAntennasEl) kpiAntennasEl.textContent = uniqueAntennas.toLocaleString();
  if (kpiExpeditionsEl) kpiExpeditionsEl.textContent = uniqueExpeditions.toLocaleString();

  // 2. Gráfico de distribución de tipos de evento
  renderEventTypesChart(records);

  // 3. Gráfico de actividad por horas (00:00 a 23:00)
  renderHourlyActivityChart(records);

  // 4. Tabla de Números Críticos / Mayor Tráfico
  renderTopSuspiciousNumbers(records);
}

function renderEventTypesChart(records) {
  const ctx = document.getElementById('chart-event-types');
  if (!ctx || !window.Chart) return;

  const counts = { llamada: 0, sms: 0, datos: 0 };
  records.forEach(r => {
    const t = (r.event_type || 'llamada').toLowerCase();
    if (counts[t] !== undefined) counts[t]++;
    else counts.llamada++;
  });

  if (chartEventsInstance) {
    chartEventsInstance.destroy();
  }

  chartEventsInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Llamadas de Voz', 'Mensajes SMS', 'Tráfico de Datos'],
      datasets: [{
        data: [counts.llamada, counts.sms, counts.datos],
        backgroundColor: ['#198754', '#6f42c1', '#0dcaf0'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderHourlyActivityChart(records) {
  const ctx = document.getElementById('chart-hourly-activity');
  if (!ctx || !window.Chart) return;

  // 24 horas
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const hourCounts = new Array(24).fill(0);

  records.forEach(r => {
    if (r.event_datetime) {
      const d = new Date(r.event_datetime);
      if (!isNaN(d.getTime())) {
        const h = getLocalHour(d);
        hourCounts[h]++;
      }
    }
  });

  if (chartHoursInstance) {
    chartHoursInstance.destroy();
  }

  chartHoursInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: hours,
      datasets: [{
        label: 'Volumen de Comunicaciones (Patrón Horario)',
        data: hourCounts,
        backgroundColor: hours.map((_, idx) => (idx >= 0 && idx <= 5) ? '#d32f2f' : '#003d7a'), // Rojo en horario nocturno crítico
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Total Eventos' } },
        x: { title: { display: true, text: 'Hora del Día (Zona Horaria Local Juárez)' } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            afterLabel: (context) => {
              if (context.dataIndex >= 0 && context.dataIndex <= 5) {
                return '⚠️ Horario Crítico Nocturno (Extorsión / Casas de Seguridad)';
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function renderTopSuspiciousNumbers(records) {
  const container = document.getElementById('dashboard-top-numbers');
  if (!container) return;

  // Contar frecuencias por número de origen
  const freqMap = {};
  records.forEach(r => {
    const o = r.phone_origin;
    if (!freqMap[o]) {
      freqMap[o] = { phone: o, count: 0, operator: r.operator || 'Telcel', totalDuration: 0, lastEvent: r.event_datetime };
    }
    freqMap[o].count++;
    freqMap[o].totalDuration += (parseInt(r.duration_seconds, 10) || 0);
  });

  const sorted = Object.values(freqMap).sort((a, b) => b.count - a.count).slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay registros cargados.</td></tr>';
    return;
  }

  container.innerHTML = sorted.map((item, idx) => `
    <tr>
      <td><span class="badge bg-secondary">#${idx + 1}</span></td>
      <td class="fw-bold text-primary">
        <a href="#" class="quick-analyze-link text-decoration-none" data-phone="${item.phone}">
          ${formatPhoneNumber(item.phone)}
        </a>
      </td>
      <td><span class="badge bg-dark">${item.operator}</span></td>
      <td><strong>${item.count}</strong> eventos</td>
      <td>${formatDuration(item.totalDuration)}</td>
    </tr>
  `).join('');

  // Event listener para salto rápido a analizador
  container.querySelectorAll('.quick-analyze-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const phone = link.getAttribute('data-phone');
      if (window.sabtelApp) {
        window.sabtelApp.switchView('analyzer');
        const input = document.getElementById('analyzer-phone-input');
        if (input) {
          input.value = phone;
          document.getElementById('btn-run-analysis')?.click();
        }
      }
    });
  });
}
