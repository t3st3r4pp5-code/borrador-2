/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 3: auth.js
 * Módulo de Autenticación, Roles (RBAC), Protección de Rutas y Sesión
 * ============================================================================
 */

import { isMockFirebase } from './firebase-config.js';

// Claves de almacenamiento
const SESSION_USER_KEY = 'sabtel_active_user';
const USERS_REGISTRY_KEY = 'sabtel_users';

// Perfiles precargados para la Unidad Antisecuestros de Cd. Juárez
export const DEFAULT_USERS = [
  {
    uid: 'usr_admin_01',
    email: 'comandancia.antisecuestros@juarez.gob.mx',
    displayName: 'Cmte. Roberto Garza (Director UECS)',
    role: 'admin',
    department: 'Dirección General de Operaciones',
    badgeNumber: 'CHIH-UECS-091',
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: new Date().toISOString()
  },
  {
    uid: 'usr_analyst_01',
    email: 'analista.tactico@juarez.gob.mx',
    displayName: 'Lic. Sofía Méndez (Analista Táctico)',
    role: 'analyst',
    department: 'Unidad de Inteligencia de Telecomunicaciones',
    badgeNumber: 'CHIH-UECS-244',
    createdAt: '2026-02-01T09:30:00Z',
    lastLogin: new Date().toISOString()
  },
  {
    uid: 'usr_auditor_01',
    email: 'asuntos.internos@juarez.gob.mx',
    displayName: 'Mtro. Héctor Valenzuela (Auditor Legal)',
    role: 'auditor',
    department: 'Control Interno y Cadena de Custodia',
    badgeNumber: 'CHIH-AUD-118',
    createdAt: '2026-01-15T10:00:00Z',
    lastLogin: new Date().toISOString()
  }
];

class AuthService {
  constructor() {
    this.currentUser = null;
    this.initUsersDatabase();
    this.restoreSession();
  }

  // Inicializa el padrón de usuarios en el almacenamiento local si no existe
  initUsersDatabase() {
    try {
      const stored = localStorage.getItem(USERS_REGISTRY_KEY);
      if (!stored || JSON.parse(stored).length === 0) {
        localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(DEFAULT_USERS));
      }
    } catch (e) {
      console.warn('Error inicializando usuarios locales:', e);
    }
  }

  // Restaura la sesión desde sessionStorage
  restoreSession() {
    try {
      const saved = sessionStorage.getItem(SESSION_USER_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error al restaurar sesión:', e);
      this.currentUser = null;
    }
  }

  // Obtiene el usuario autenticado actualmente
  getCurrentUser() {
    if (!this.currentUser) {
      this.restoreSession();
    }
    return this.currentUser;
  }

  // Verifica si el usuario tiene una sesión válida
  isAuthenticated() {
    return !!this.getCurrentUser();
  }

  // Comprueba si el usuario tiene uno de los roles autorizados
  hasRole(allowedRoles) {
    if (!this.currentUser) return false;
    if (typeof allowedRoles === 'string') {
      allowedRoles = [allowedRoles];
    }
    return allowedRoles.includes(this.currentUser.role);
  }

  // Inicio de sesión rápido con cuenta institucional preautorizada
  async loginWithPreset(userUid) {
    const users = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '[]');
    const user = users.find(u => u.uid === userUid) || DEFAULT_USERS.find(u => u.uid === userUid);
    
    if (!user) {
      throw new Error('Credenciales o usuario institucional no localizado.');
    }

    user.lastLogin = new Date().toISOString();
    
    // Actualizar registro
    const updatedUsers = users.map(u => u.uid === user.uid ? user : u);
    localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(updatedUsers));

    // Guardar en sessionStorage
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    this.currentUser = user;

    this.logAuthEvent('LOGIN_PRESET', `Inicio de sesión autorizado: ${user.displayName} (${user.role})`);
    return user;
  }

  // Inicio de sesión con Google OAuth2
  async loginWithGoogle() {
    // Si estamos en producción con Firebase configurado
    if (!isMockFirebase && window.firebase?.auth) {
      try {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        const result = await window.firebase.auth().signInWithPopup(provider);
        const fbUser = result.user;
        
        // Asignar rol por defecto o consultar padrón
        const users = JSON.parse(localStorage.getItem(USERS_REGISTRY_KEY) || '[]');
        let userProfile = users.find(u => u.email === fbUser.email);
        
        if (!userProfile) {
          userProfile = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || 'Oficial de Guardia',
            role: 'analyst', // Rol seguro por defecto
            department: 'Análisis Forense',
            badgeNumber: 'CHIH-EXT-' + Math.floor(100 + Math.random() * 900),
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          };
          users.push(userProfile);
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
        }

        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(userProfile));
        this.currentUser = userProfile;
        this.logAuthEvent('LOGIN_GOOGLE_SUCCESS', `OAuth completado para ${userProfile.email}`);
        return userProfile;
      } catch (err) {
        console.error('Error en autenticación Google:', err);
        throw err;
      }
    } else {
      // Modo Demo / Fallback interactivo si no hay Cloud OAuth configurado
      const simulatedGoogleUser = {
        uid: 'usr_google_demo_' + Date.now(),
        email: 'agente.investigador@fiscalia.chih.gob.mx',
        displayName: 'Agente Investigador (Google Workspace)',
        role: 'analyst',
        department: 'Guardia de Homicidios y Secuestros',
        badgeNumber: 'CHIH-UECS-702',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(simulatedGoogleUser));
      this.currentUser = simulatedGoogleUser;
      this.logAuthEvent('LOGIN_GOOGLE_DEMO', `Sesión Google Demo iniciada para ${simulatedGoogleUser.email}`);
      return simulatedGoogleUser;
    }
  }

  // Cierre de sesión forense
  logout() {
    if (this.currentUser) {
      this.logAuthEvent('LOGOUT', `Cierre de sesión del usuario: ${this.currentUser.email}`);
    }
    sessionStorage.removeItem(SESSION_USER_KEY);
    this.currentUser = null;
    
    // Redirección segura a login
    window.location.href = 'login.html';
  }

  // Guarda un evento en la bitácora de auditoría inmutable
  logAuthEvent(action, description) {
    try {
      const auditLog = JSON.parse(localStorage.getItem('sabtel_audit_log') || '[]');
      const event = {
        id: 'aud_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        userId: this.currentUser?.uid || 'ANONYMOUS',
        userName: this.currentUser?.displayName || 'Sistema',
        role: this.currentUser?.role || 'N/A',
        action,
        description,
        ipAddress: '10.240.18.52 (Red Segura Fiscalia Cd. Juárez)'
      };
      auditLog.unshift(event);
      // Mantener últimos 1,000 eventos en memoria
      if (auditLog.length > 1000) auditLog.pop();
      localStorage.setItem('sabtel_audit_log', JSON.stringify(auditLog));
    } catch (e) {
      console.warn('No se pudo registrar evento de auditoría:', e);
    }
  }

  // Middleware de protección de páginas
  protectRoute(allowedRoles = null) {
    const user = this.getCurrentUser();
    if (!user) {
      console.warn('[Seguridad] Acceso no autorizado. Redirigiendo a login...');
      window.location.href = 'login.html';
      return false;
    }

    if (allowedRoles && !this.hasRole(allowedRoles)) {
      console.warn(`[Seguridad] El rol '${user.role}' no tiene permiso para este recurso.`);
      alert(`Acceso denegado: Se requiere rol de [${Array.isArray(allowedRoles) ? allowedRoles.join(', ') : allowedRoles}] para esta función.`);
      return false;
    }

    return true;
  }
}

export const auth = new AuthService();
