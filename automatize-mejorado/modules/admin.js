/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 13: modules/admin.js
 * Panel de Administración, Control de Acceso (RBAC), Auditoría Forense y Métricas
 * ============================================================================
 */

import { auth, DEFAULT_USERS } from '../auth.js';
import { dbService } from '../firebase-config.js';
import { formatDateTime, showToast } from '../utils.js';

export function initAdminModule() {
  console.log('[Admin] Inicializando panel de control y auditoría...');

  document.getElementById('btn-refresh-audit')?.addEventListener('click', renderAuditLog);
  document.getElementById('btn-add-user')?.addEventListener('click', handleAddNewUser);
  document.getElementById('btn-clear-db-demo')?.addEventListener('click', handleResetDemoData);
}

export async function renderAdminPanel() {
  // Solo administradores y auditores tienen acceso
  if (!auth.hasRole(['admin', 'auditor'])) {
    showToast('Acceso restringido: Se requiere perfil de Administrador o Auditor', 'danger');
    return;
  }

  renderUsersList();
  renderAuditLog();
  renderSystemHealth();
}

function renderUsersList() {
  const container = document.getElementById('admin-users-table-body');
  if (!container) return;

  const users = JSON.parse(localStorage.getItem('sabtel_users') || '[]');
  const currentUser = auth.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  container.innerHTML = users.map(u => {
    const roleBadge = u.role === 'admin' ? 'bg-danger' : u.role === 'auditor' ? 'bg-warning text-dark' : 'bg-primary';

    return `
      <tr>
        <td>
          <div class="fw-bold text-navy">${u.displayName}</div>
          <small class="text-muted">${u.email}</small>
        </td>
        <td><code>${u.badgeNumber || 'SIN-GAFETE'}</code></td>
        <td><small>${u.department || 'UECS Cd. Juárez'}</small></td>
        <td><span class="badge ${roleBadge}">${u.role.toUpperCase()}</span></td>
        <td><small>${formatDateTime(u.lastLogin)}</small></td>
        <td class="text-end">
          ${isAdmin ? `
            <select class="form-select form-select-sm d-inline-block w-auto" onchange="window.changeUserRole('${u.uid}', this.value)">
              <option value="analyst" ${u.role === 'analyst' ? 'selected' : ''}>Analista</option>
              <option value="auditor" ${u.role === 'auditor' ? 'selected' : ''}>Auditor</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
            </select>
          ` : '<span class="text-muted small">Sólo Lectura</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderAuditLog() {
  const container = document.getElementById('admin-audit-table-body');
  if (!container) return;

  const logs = JSON.parse(localStorage.getItem('sabtel_audit_log') || '[]');

  if (logs.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay eventos en la bitácora aún.</td></tr>';
    return;
  }

  container.innerHTML = logs.slice(0, 50).map(log => `
    <tr>
      <td class="text-nowrap"><small>${formatDateTime(log.timestamp)}</small></td>
      <td><strong>${log.userName}</strong> <span class="badge bg-light text-dark">${log.role}</span></td>
      <td><span class="badge bg-secondary font-monospace">${log.action}</span></td>
      <td><small>${log.description}</small></td>
      <td><code class="small text-muted">${log.ipAddress || '10.240.x.x'}</code></td>
    </tr>
  `).join('');
}

async function renderSystemHealth() {
  const records = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
  const auditLogs = JSON.parse(localStorage.getItem('sabtel_audit_log') || '[]');
  const users = JSON.parse(localStorage.getItem('sabtel_users') || '[]');

  const quotaPercent = Math.min(100, Math.round((records.length / 10000) * 100)); // Capacidad MVP 10,000 registros

  const quotaBar = document.getElementById('admin-quota-progress');
  const quotaText = document.getElementById('admin-quota-text');

  if (quotaBar) {
    quotaBar.style.width = `${quotaPercent}%`;
    quotaBar.className = `progress-bar ${quotaPercent > 80 ? 'bg-danger' : 'bg-primary'}`;
  }

  if (quotaText) {
    quotaText.textContent = `${records.length.toLocaleString()} de 10,000 registros asignados al MVP (${quotaPercent}%)`;
  }
}

function handleAddNewUser() {
  const name = prompt('Nombre completo del oficial/analista:');
  if (!name) return;
  const email = prompt('Correo institucional (@juarez.gob.mx o fiscalia.chih.gob.mx):');
  if (!email) return;
  const role = prompt('Rol del usuario (admin, auditor, analyst):', 'analyst');

  const users = JSON.parse(localStorage.getItem('sabtel_users') || '[]');
  if (users.length >= 20) {
    alert('Límite del MVP alcanzado: Máximo 20 usuarios autorizados para esta fase.');
    return;
  }

  const newUser = {
    uid: 'usr_' + Date.now(),
    email: email.trim().toLowerCase(),
    displayName: name.trim(),
    role: ['admin', 'auditor', 'analyst'].includes(role) ? role : 'analyst',
    department: 'Unidad Antisecuestros Cd. Juárez',
    badgeNumber: 'CHIH-UECS-' + Math.floor(100 + Math.random() * 900),
    createdAt: new Date().toISOString(),
    lastLogin: 'Pendiente'
  };

  users.push(newUser);
  localStorage.setItem('sabtel_users', JSON.stringify(users));
  renderUsersList();
  showToast(`Usuario ${newUser.displayName} dado de alta con éxito`, 'success');
  auth.logAuthEvent('USER_CREATED', `Alta de usuario: ${newUser.email} con rol ${newUser.role}`);
}

async function handleResetDemoData() {
  if (confirm('¿ADVERTENCIA: Desea reiniciar todos los registros telefónicos y cargar el caso modelo de Cd. Juárez?')) {
    const { generateJuarezDemoRecords } = await import('../scripts/generate-fake-data.js');
    const freshData = generateJuarezDemoRecords(500);
    await dbService.saveCollection(dbService.COLLECTIONS.RECORDS, freshData);
    showToast('Base forense restablecida con 500 registros del caso modelo.', 'success');
    auth.logAuthEvent('DATABASE_RESET', 'Restablecimiento de base de datos a caso modelo.');
    setTimeout(() => window.location.reload(), 800);
  }
}

window.changeUserRole = function(uid, newRole) {
  const users = JSON.parse(localStorage.getItem('sabtel_users') || '[]');
  const user = users.find(u => u.uid === uid);
  if (user) {
    user.role = newRole;
    localStorage.setItem('sabtel_users', JSON.stringify(users));
    showToast(`Rol de ${user.displayName} actualizado a: ${newRole.toUpperCase()}`, 'info');
    auth.logAuthEvent('USER_ROLE_CHANGED', `Cambio de rol para ${user.email} -> ${newRole}`);
    renderUsersList();
  }
};
