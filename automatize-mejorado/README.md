# SABTEL • CDDDM - Sistema Forense de Análisis de Sábanas Telefónicas (CDR)
**Unidad Especializada en Combate al Secuestro (UECS) • Ciudad Juárez, Chihuahua, México**

SABTEL (Sistema de Análisis de Sábanas Telefónicas) es una plataforma web táctica de inteligencia forense diseñada específicamente para unidades antisecuestros, análisis criminal y ministerios públicos. Permite ingerir, depurar, cruzar y geolocalizar registros detallados de llamadas (CDR - *Call Detail Records*) y SMS provenientes de concesionarios de telecomunicaciones (Telcel, AT&T, Movistar) para esclarecer privaciones ilegales de la libertad y extorsiones.

---

## 🛡️ Arquitectura 100% Gratuita (Free-Tier Stack)

| Componente | Plataforma / Tecnología | Capacidad / Límite Gratuito |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS ES6+, HTML5, Bootstrap 5, Leaflet, Chart.js, jsPDF | Vercel Hobby (Ancho de banda ilimitado) |
| **Base de Datos** | Firebase Firestore (Spark Plan) + Respaldo Local | 1 GiB almacenamiento, 50k lecturas/día |
| **Autenticación** | Firebase Auth + Google OAuth 2.0 | Usuarios ilimitados por mes |
| **Almacenamiento** | Firebase Storage | 5 GiB gratis al mes |
| **CI / CD** | GitHub Actions | 2,000 minutos de compilación al mes |

---

## 🚀 Funcionalidades Clave del MVP

1. **Splash Screen Táctico CDDDM**:
   - Pantalla de bienvenida con identidad visual institucional de alta resolución y efecto de desvanecimiento dinámico al inicializar la terminal forense.

2. **Autenticación y Control de Acceso Basado en Roles (RBAC)**:
   - Acceso con Google OAuth institucional o perfiles demostrativos inmediatos:
     - `Admin`: Cmte. Roberto Garza (Director UECS - Gestión total y asignación de roles).
     - `Analista`: Lic. Sofía Méndez (Perfilado táctico, importación y cruce de datos).
     - `Auditor`: Mtro. Héctor Valenzuela (Asuntos Internos, verificación de cadena de custodia).

3. **Asistente de Importación Inteligente (CSV / XLSX)**:
   - Detección automática de encabezados de operadoras mexicanas.
   - Mapeo dinámico e interactivo a campos estándar (origen, destino, fecha/hora, duración, celda, azimut, coordenadas).
   - Depuración automática de duplicados y normalización de números a 10 dígitos (formato TEXT estricto para evitar pérdidas de ceros).
   - Botón para cargar sábana muestra sintética de Ciudad Juárez en 1 clic.

4. **Explorador CDR Paginado**:
   - Paginación ágil de 50 registros por página.
   - Filtros instantáneos por número origen/destino, operador, tipo de evento (llamada/sms/datos), sentido y rango de fechas.
   - Búsqueda en tiempo real y modal con detalles técnicos de antena.
   - Exportación de resultados filtrados a CSV.

5. **Análisis Individual por Número (Blanco / Víctima)**:
   - Gráfico de actividad horaria (24 horas) para detectar llamadas extorsivas nocturnas (00:00 - 05:00 hrs).
   - Top 10 contactos más frecuentes con desglose de llamadas, SMS y duración total.
   - Última antena conectada y lista de hotspots o antenas más frecuentadas.

6. **Comparador y Cruce de Vínculos**:
   - Detección automática de comunicaciones directas entre dos números sospechosos.
   - Identificación de contactos en común (intermediarios, halcones o cómplices).
   - Antenas coincidentes para determinar probable co-ubicación física.
   - Línea de tiempo sincronizada entre ambos números.

7. **Mapa Táctico de Celdas (Ciudad Juárez)**:
   - Centrado en Ciudad Juárez (`31.6904, -106.4245`).
   - Celdas geolocalizadas: Centro Histórico, Pronaf, Av. De Las Torres, Anapra, Riveras del Bravo, Sendero, El Chamizal, Aeropuerto.
   - Representación de apertura angular de azimut (haz de cobertura de 60°).
   - Trazado de ruta cronológica de desplazamientos con banderas de inicio y último registro.

8. **Generación de Dictamen Pericial en PDF**:
   - Membrete oficial ficticio de la Fiscalía General del Estado de Chihuahua / UECS.
   - Resumen ejecutivo, metodología forense, tabla de registros críticos y cadena de custodia con firmas oficiales.

9. **Panel Administrativo y Bitácora de Auditoría**:
   - Padrón de hasta 20 usuarios autorizados con edición de roles en caliente.
   - Registro inmutable de eventos conforme al Código Nacional de Procedimientos Penales.
   - Monitor de consumo de cuota de almacenamiento.

---

## 📂 Estructura del Código

```text
├── .github/workflows/
│   └── deploy.yml            # Pipeline de CI/CD para GitHub y Vercel
├── modules/
│   ├── admin.js              # Gestión de usuarios, roles y auditoría inmutable
│   ├── analyzer.js           # Perfilado profundo de número sospechoso o víctima
│   ├── comparator.js         # Cruce de llamadas, intermediarios y antenas comunes
│   ├── dashboard.js          # Métricas ejecutivas, KPIs y gráficos de actividad
│   ├── explorer.js           # Tabla CDR paginada a 50 registros y filtros
│   ├── import.js             # Asistente de mapeo de sábanas y descarte de duplicados
│   ├── map.js                # Mapa Leaflet de Cd. Juárez con sectores de azimut
│   └── reports.js            # Compilador de dictámenes e informes PDF con jsPDF
├── scripts/
│   └── generate-fake-data.js # Generador de datos CDR hiperrealistas de Cd. Juárez
├── app.js                    # Coordinador general de la aplicación
├── auth.js                   # Sistema de autenticación RBAC y sesión
├── dashboard.html            # Terminal forense principal (SPA)
├── firebase-config.js        # Configuración e inicialización de Firebase
├── firebase.json             # Configuración de Firebase Hosting y Rules
├── firestore.rules           # Reglas de seguridad RBAC de Firestore
├── index.html                # Enrutador inicial con carga segura
├── login.html                # Portal institucional de acceso seguro
├── main.css                  # Hoja de estilos institucionales y tema oscuro/claro
├── package.json              # Dependencias y scripts de ejecución
├── utils.js                  # Utilidades forenses, zona horaria y validaciones
└── vercel.json               # Configuración para despliegue en Vercel
```

---

## 🛠️ Instalación y Ejecución Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/sabtel-juarez.git
   cd sabtel-juarez
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo en el puerto 3000:
   ```bash
   npm run dev
   ```

4. Generar registros sintéticos adicionales (opcional):
   ```bash
   npm run generate-data
   ```

---

## ☁️ Despliegue en Producción (Vercel)

El proyecto incluye `vercel.json` preconfigurado. Para desplegar manualmente o vincular a tu cuenta de Vercel:

```bash
npx vercel
```

Para despliegue automático mediante GitHub Actions, configure los siguientes **Secrets** en su repositorio de GitHub:
- `VERCEL_TOKEN`: Token personal de Vercel.
- `VERCEL_ORG_ID`: ID de organización / equipo en Vercel.
- `VERCEL_PROJECT_ID`: ID del proyecto en Vercel.

---

## ⚖️ Aviso Legal y Cumplimiento Normativo
Los datos generados para este MVP son estrictamente ficticios y con propósitos de investigación, demostración y capacitación policial. Las coordenadas corresponden a puntos públicos de referencia de Ciudad Juárez, Chihuahua.
