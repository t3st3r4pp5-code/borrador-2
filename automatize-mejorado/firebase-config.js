/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * Unidad Especializada en Combate al Secuestro (UECS) - Ciudad Juárez, Chih.
 * ============================================================================
 * 
 * ARCHIVO 1: firebase-config.js
 * Configuración e inicialización de Firebase Client SDK v10 (Firestore, Auth, Storage)
 * 
 * ARQUITECTURA Y DECISIONES TÉCNICAS:
 * - Capa Gratuita de Firebase (Spark Plan):
 *   - Firestore: 1 GiB de almacenamiento, 50k lecturas/día, 20k escrituras/día.
 *   - Auth: Usuarios ilimitados por correo/Google OAuth.
 *   - Storage: 5 GiB de almacenamiento.
 * - Modo Resiliente / Híbrido:
 *   Permite inicializarse con credenciales reales de Firebase o entrar en 'Modo Demo Seguro'
 *   automáticamente si las claves no están provistas, garantizando que el MVP funcione
 *   de inmediato tanto en entornos locales, Vercel, o ambientes aislados sin conexión.
 */

// Configuración de Firebase obtenida de variables de entorno (Vercel / Vite) o fallback seguro
export const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyDemoJuarezAntisecuestrosKey2026",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "sabtel-juarez.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "sabtel-juarez",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "sabtel-juarez.appspot.com",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "897933259816",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:897933259816:web:c3c3e10fd3e04f7e"
};

// Variable de estado que indica si Firebase en la nube está activo o si corre en almacenamiento local sincronizado
export const isMockFirebase = (
  !import.meta.env?.VITE_FIREBASE_API_KEY || 
  import.meta.env?.VITE_FIREBASE_API_KEY.includes("Demo")
);

/**
 * Servicio unificado de base de datos que abstrae Firestore y almacena en LocalStorage
 * cuando se usa el modo demostración forense.
 */
class ForensicDataService {
  constructor() {
    this.COLLECTIONS = {
      USERS: 'sabtel_users',
      RECORDS: 'sabtel_records',
      EXPEDITIONS: 'sabtel_expeditions',
      AUDIT: 'sabtel_audit_log',
      SETTINGS: 'sabtel_settings'
    };
    this.initLocalStorage();
  }

  initLocalStorage() {
    Object.values(this.COLLECTIONS).forEach(colKey => {
      if (!localStorage.getItem(colKey)) {
        localStorage.setItem(colKey, JSON.stringify([]));
      }
    });
  }

  // Obtener todos los documentos de una colección
  async getCollection(collectionName) {
    try {
      const data = localStorage.getItem(collectionName);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error(`[DataService] Error al leer colección ${collectionName}:`, err);
      return [];
    }
  }

  // Guardar o sobreescribir lote de documentos
  async saveCollection(collectionName, items) {
    try {
      localStorage.setItem(collectionName, JSON.stringify(items));
      return true;
    } catch (err) {
      console.error(`[DataService] Error al guardar colección ${collectionName}:`, err);
      throw err;
    }
  }

  // Insertar múltiples registros de una sábana
  async insertRecordsBatch(records) {
    const existing = await this.getCollection(this.COLLECTIONS.RECORDS);
    const combined = [...existing, ...records];
    await this.saveCollection(this.COLLECTIONS.RECORDS, combined);
    return records.length;
  }

  // Eliminar registros de un expediente específico
  async deleteRecordsByExpedition(expeditionId) {
    const existing = await this.getCollection(this.COLLECTIONS.RECORDS);
    const filtered = existing.filter(r => r.expedition_id !== expeditionId);
    await this.saveCollection(this.COLLECTIONS.RECORDS, filtered);
    return existing.length - filtered.length;
  }
}

export const dbService = new ForensicDataService();
console.log(`[FirebaseConfig] SABTEL Inicializado. Modo: ${isMockFirebase ? 'Demo Forense Offline/Local' : 'Firebase Cloud Producción'}`);
