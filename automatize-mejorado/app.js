/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 5: app.js
 * Coordinador Principal de la Aplicación Forense
 * ============================================================================
 */

import { auth } from './auth.js';
import { dbService } from './firebase-config.js';
import { showToast } from './utils.js';

// Módulos especializados
import { initDashboard, renderDashboard } from './modules/dashboard.js';
import { initImportModule } from './modules/import.js';
import { initExplorerModule, renderExplorer } from './modules/explorer.js';
import { initAnalyzerModule } from './modules/analyzer.js';
import { initComparatorModule } from './modules/comparator.js';
import { initMapModule, renderMap } from './modules/map.js';
import { initReportsModule } from './modules/reports.js';
import { initAdminModule } from './modules/admin.js';
import { initNetworkModule, renderNetworkDiagram } from './modules/network.js';
import { initOsintModule, renderOsintModule } from './modules/osint.js';
import { initCryptoCustodyModule, renderCryptoCustodyModule } from './modules/crypto-custody.js';
import { initMultiSheetModule, renderMultiSheetModule } from './modules/multi-sheet.js';
import { initBehaviorModule, renderBehaviorModule } from './modules/behavior.js';
import { initVehicleModule, renderVehicleModule } from './modules/vehicle-id.js';

class SabtelApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentExpedition = 'EXP-2026-084-SEC'; // Caso Secuestro Cd. Juárez por defecto
  }

  async init() {
    console.log('[SABTEL] Iniciando sistema de análisis de sábanas...');

    // 1. Verificar autenticación
    if (!auth.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }

    // 2. Cargar usuario en UI
    this.renderUserInfo();

    // 3. Aplicar preferencias guardadas (tema, fuente)
    this.applySavedPreferences();

    // 4. Inicializar datos de demostración si la base está vacía
    await this.ensureDemoDataLoaded();

    // 5. Inicializar módulos
    initDashboard();
    initImportModule();
    initExplorerModule();
    initAnalyzerModule();
    initComparatorModule();
    initMapModule();
    initNetworkModule();
    initOsintModule();
    initCryptoCustodyModule();
    initMultiSheetModule();
    initBehaviorModule();
    initVehicleModule();
    initReportsModule();
    initAdminModule();

    // 6. Configurar listeners de navegación y eventos globales
    this.setupEventListeners();

    // 7. Renderizar vista inicial
    this.switchView('dashboard');

    // 8. Desvanecer pantalla de carga táctica CDDDM tras breve momento
    setTimeout(() => {
      const splash = document.getElementById('cdddm-splash-overlay');
      if (splash) {
        splash.classList.add('splash-hidden');
      }
    }, 1300);
  }

  renderUserInfo() {
    const user = auth.getCurrentUser();
    if (!user) return;

    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-role-badge');
    const badgeEl = document.getElementById('user-badge-number');

    if (nameEl) nameEl.textContent = user.displayName;
    if (badgeEl) badgeEl.textContent = user.badgeNumber || 'UECS-CHIH';
    if (roleEl) {
      roleEl.textContent = user.role.toUpperCase();
      roleEl.className = 'badge ' + (
        user.role === 'admin' ? 'bg-danger' : 
        user.role === 'auditor' ? 'bg-warning text-dark' : 'bg-primary'
      );
    }

    // Ocultar pestaña admin si no tiene privilegios
    const adminNavItem = document.getElementById('nav-item-admin');
    if (adminNavItem) {
      adminNavItem.style.display = (user.role === 'admin' || user.role === 'auditor') ? 'block' : 'none';
    }
  }

  setupEventListeners() {
    // Navegación por menú lateral
    document.querySelectorAll('[data-target-view]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-target-view');
        this.switchView(target);
        
        // Cerrar menú móvil si está abierto
        document.querySelector('.sidebar')?.classList.remove('show');
        document.querySelector('.sidebar-backdrop')?.classList.remove('show');
      });
    });

    // Botón de menú hamburguesa móvil
    const mobileToggle = document.getElementById('btn-sidebar-toggle');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('show');
        backdrop?.classList.toggle('show');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.remove('show');
        backdrop.classList.remove('show');
      });
    }

    // Cerrar sesión
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('¿Desea cerrar la sesión del sistema forense?')) {
          auth.logout();
        }
      });
    }

    // Selector de tema
    const themeToggle = document.getElementById('theme-toggle-btn');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // Selector de tamaño de fuente
    document.querySelectorAll('[data-font-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-font-size');
        this.setFontSize(size);
      });
    });

    // Selector de caso activo
    const caseSelect = document.getElementById('global-case-selector');
    if (caseSelect) {
      caseSelect.addEventListener('change', (e) => {
        this.currentExpedition = e.target.value;
        showToast(`Expediente activo cambiado a: ${this.currentExpedition}`, 'info');
        this.refreshCurrentView();
      });
    }
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Actualizar enlaces activos en el sidebar
    document.querySelectorAll('.nav-forensic .nav-link').forEach(link => {
      if (link.getAttribute('data-target-view') === viewName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Mostrar/Ocultar secciones de vista
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.add('d-none');
    });

    const activeSection = document.getElementById(`view-${viewName}`);
    if (activeSection) {
      activeSection.classList.remove('d-none');
    }

    // Llamar al renderizador específico de cada vista
    this.refreshCurrentView();
  }

  refreshCurrentView() {
    switch (this.currentView) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'explorer':
        renderExplorer();
        break;
      case 'map':
        setTimeout(() => renderMap(), 150);
        break;
      case 'network':
        renderNetworkDiagram();
        break;
      case 'osint':
        renderOsintModule();
        break;
      case 'custody':
        renderCryptoCustodyModule();
        break;
      case 'multisheet':
        renderMultiSheetModule();
        break;
      case 'behavior':
        renderBehaviorModule();
        break;
      case 'vehicle':
        renderVehicleModule();
        break;
      default:
        break;
    }
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('sabtel_theme', newTheme);

    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.className = newTheme === 'dark' ? 'bi bi-sun-fill text-warning' : 'bi bi-moon-stars-fill text-secondary';
    }
  }

  setFontSize(size) {
    document.body.classList.remove('font-sm', 'font-md', 'font-lg');
    document.body.classList.add(`font-${size}`);
    localStorage.setItem('sabtel_font_size', size);
  }

  applySavedPreferences() {
    const savedTheme = localStorage.getItem('sabtel_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.className = savedTheme === 'dark' ? 'bi bi-sun-fill text-warning' : 'bi bi-moon-stars-fill text-secondary';
    }

    const savedFont = localStorage.getItem('sabtel_font_size') || 'md';
    this.setFontSize(savedFont);
  }

  async ensureDemoDataLoaded() {
    const records = await dbService.getCollection(dbService.COLLECTIONS.RECORDS);
    if (!records || records.length === 0) {
      console.log('[SABTEL] Generando registros demo para Cd. Juárez...');
      // Importar dinámicamente o generar registros iniciales
      const { generateJuarezDemoRecords } = await import('./scripts/generate-fake-data.js');
      const demoData = generateJuarezDemoRecords(500);
      await dbService.insertRecordsBatch(demoData);
      console.log(`[SABTEL] ${demoData.length} registros iniciales cargados en la base forense.`);
    }
  }
}

// Inicializar la aplicación cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
  window.sabtelApp = new SabtelApp();
  window.sabtelApp.init();
});
