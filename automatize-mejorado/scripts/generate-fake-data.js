/**
 * ============================================================================
 * SABTEL - SISTEMA DE ANÁLISIS DE SÁBANAS TELEFÓNICAS
 * ARCHIVO 20: scripts/generate-fake-data.js
 * Generador Forense de Registros Telefónicos Sintéticos (CDR) - Cd. Juárez
 * ============================================================================
 */

// Antenas SINTÉTICAS ubicadas en puntos públicos de referencia de Ciudad Juárez (no son sitios reales de operador)
export const JUAREZ_CELL_TOWERS = [
  { cell_id: 'JUAR-BTS-01_CENTRO', lat: 31.7380, lng: -106.4850, azimuth: 45, site_name: 'Catedral - Centro Histórico', operator: 'Telcel' },
  { cell_id: 'JUAR-BTS-04_PRONAF', lat: 31.7225, lng: -106.4420, azimuth: 120, site_name: 'Zona PRONAF - Museo de Arte', operator: 'Telcel' },
  { cell_id: 'JUAR-BTS-08_TORRES', lat: 31.6350, lng: -106.3980, azimuth: 210, site_name: 'Av. De Las Torres / Soriana', operator: 'AT&T' },
  { cell_id: 'JUAR-BTS-12_ANAPRA', lat: 31.7750, lng: -106.5520, azimuth: 300, site_name: 'Anapra', operator: 'Telcel' },
  { cell_id: 'JUAR-BTS-15_RIVERAS', lat: 31.5850, lng: -106.2890, azimuth: 90, site_name: 'Riveras del Bravo Etapa VIII', operator: 'Movistar' },
  { cell_id: 'JUAR-BTS-20_SENDERO', lat: 31.6580, lng: -106.3680, azimuth: 180, site_name: 'Plaza Sendero / Blvd. Gómez Morín', operator: 'AT&T' },
  { cell_id: 'JUAR-BTS-23_CHAMIZAL', lat: 31.7580, lng: -106.4520, azimuth: 0, site_name: 'El Chamizal / Puente Córdova-Américas', operator: 'Telcel' },
  { cell_id: 'JUAR-BTS-28_AEROPUERTO', lat: 31.6360, lng: -106.4280, azimuth: 150, site_name: 'Aeropuerto Int. Abraham González', operator: 'Telcel' }
];

// Actores clave en la investigación forense modelo
export const KEY_INVESTIGATION_TARGETS = {
  SUSPECT_LEADER: '6561829304',   // Alias: "El Jaguar" (Cabecilla)
  SUSPECT_CALLER: '6563948571',   // Teléfono de llamadas extorsivas / rescate
  VICTIM_FAMILY:  '6568273645',   // Teléfono del familiar de la víctima (recibe llamadas)
  ACCOMPLICE_LOG: '6565123498',   // Cómplice / Vigilante en Anapra
  INTERMEDIARY:   '6567788990'    // Eslabón común / Distribuidor de SIMs
};

/**
 * Generador pseudoaleatorio con semilla (mulberry32): la demo produce siempre los mismos datos,
 * así un hallazgo mostrado en el pitch se puede repetir frente al jurado
 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genera N registros telefónicos hiperrealistas con patrones forenses coherentes
 */
export function generateJuarezDemoRecords(count = 500, expeditionId = 'EXP-2026-084-SEC') {
  const random = seededRandom(20261024);
  const records = [];
  const baseTime = new Date('2026-10-20T08:00:00Z').getTime();
  const timeSpanMs = 7 * 24 * 60 * 60 * 1000; // 7 días de investigación

  const otherNumbers = [
    '6562019283', '6563148596', '6564257182', '6565369201', '6566471829',
    '6567582930', '6568693041', '6569704152', '6561029384', '6562130495',
    '6563241506', '6564352617', '6565463728', '6566574839', '6567685940'
  ];

  for (let i = 0; i < count; i++) {
    // 35% de los eventos involucran a los actores clave de la investigación
    const isTargetEvent = random() < 0.35;
    let origin, destination;

    if (isTargetEvent) {
      const scenario = random();
      if (scenario < 0.35) {
        // Llamada de rescate: Secuestrador llama a la familia
        origin = KEY_INVESTIGATION_TARGETS.SUSPECT_CALLER;
        destination = KEY_INVESTIGATION_TARGETS.VICTIM_FAMILY;
      } else if (scenario < 0.65) {
        // Coordinación entre secuestradores
        origin = KEY_INVESTIGATION_TARGETS.SUSPECT_LEADER;
        destination = KEY_INVESTIGATION_TARGETS.ACCOMPLICE_LOG;
      } else {
        // Comunicación con el intermediario común
        origin = random() > 0.5 ? KEY_INVESTIGATION_TARGETS.SUSPECT_LEADER : KEY_INVESTIGATION_TARGETS.SUSPECT_CALLER;
        destination = KEY_INVESTIGATION_TARGETS.INTERMEDIARY;
      }
    } else {
      origin = otherNumbers[Math.floor(random() * otherNumbers.length)];
      destination = otherNumbers[Math.floor(random() * otherNumbers.length)];
      while (destination === origin) {
        destination = otherNumbers[Math.floor(random() * otherNumbers.length)];
      }
    }

    // Tipo de evento
    const randType = random();
    const eventType = randType < 0.65 ? 'llamada' : randType < 0.85 ? 'sms' : 'datos';
    const direction = random() < 0.5 ? 'saliente' : 'entrante';
    const duration = eventType === 'llamada' ? Math.floor(15 + random() * 340) : 0;

    // Distribución horaria con picos nocturnos típicos de delitos graves
    let eventTimeOffset = random() * timeSpanMs;
    const eventDate = new Date(baseTime + eventTimeOffset);
    if (isTargetEvent && random() < 0.45) {
      // Forzar llamada nocturna entre 00:00 y 04:30 hrs
      eventDate.setHours(Math.floor(random() * 5), Math.floor(random() * 60));
    }

    // Antena celular
    let tower;
    if (origin === KEY_INVESTIGATION_TARGETS.ACCOMPLICE_LOG) {
      // El cómplice opera cerca de la casa de seguridad en Anapra
      tower = JUAREZ_CELL_TOWERS[3]; // ANAPRA
    } else if (origin === KEY_INVESTIGATION_TARGETS.SUSPECT_LEADER) {
      // El cabecilla se mueve entre Las Torres y Pronaf
      tower = random() < 0.6 ? JUAREZ_CELL_TOWERS[1] : JUAREZ_CELL_TOWERS[2];
    } else {
      tower = JUAREZ_CELL_TOWERS[Math.floor(random() * JUAREZ_CELL_TOWERS.length)];
    }

    records.push({
      rec_id: `rec_juarez_${String(i + 1).padStart(5, '0')}`,
      import_id: 'imp_juarez_model_2026',
      expedition_id: expeditionId,
      phone_origin: origin,
      phone_destination: destination,
      event_datetime: eventDate.toISOString(),
      event_type: eventType,
      direction: direction,
      duration_seconds: duration,
      operator: tower.operator,
      cell_id: tower.cell_id,
      // Coordenada de la antena: el registro no ubica a la persona, solo la celda que la atendió
      latitude: tower.lat,
      longitude: tower.lng,
      azimuth: tower.azimuth
    });
  }

  // Ordenar cronológicamente
  return records.sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));
}

/**
 * Genera el dataset específico del Caso UAYC / Parral-Juárez para la línea 6271218386
 * con estructura de 1 línea central, interlocutores y ráfagas de datos de 3600 seg
 */
export function generateUAYC627CaseRecords(expeditionId = 'EXP-2026-084-SEC') {
  const random = seededRandom(6271218386);
  const centralTarget = '6271218386';
  const interlocutors = [
    { phone: '6271134588', type: 'llamada', dir: 'saliente', dur: 180, count: 8 },
    { phone: '6271134588', type: 'llamada', dir: 'entrante', dur: 210, count: 6 },
    { phone: '6271474227', type: 'llamada', dir: 'saliente', dur: 45, count: 2 },
    { phone: '6271474227', type: 'llamada', dir: 'entrante', dur: 120, count: 2 },
    { phone: '6271449752', type: 'llamada', dir: 'saliente', dur: 60, count: 3 },
    { phone: '6271148264', type: 'llamada', dir: 'saliente', dur: 35, count: 1 },
    { phone: '6271231031', type: 'llamada', dir: 'saliente', dur: 90, count: 1 },
    { phone: '6271030501', type: 'llamada', dir: 'saliente', dur: 15, count: 1 },
    { phone: '6271430295', type: 'llamada', dir: 'saliente', dur: 24, count: 1 },
    { phone: '6565901978', type: 'llamada', dir: 'entrante', dur: 200, count: 2 },
    { phone: '142323', type: 'sms', dir: 'entrante', dur: 0, count: 4 },
    { phone: '6271130597', type: 'llamada', dir: 'entrante', dur: 115, count: 3 },
    { phone: 'BUZON', type: 'llamada', dir: 'saliente', dur: 48, count: 3 },
    { phone: 'TELCEL', type: 'sms', dir: 'entrante', dur: 0, count: 2 },
    { phone: '6271181113', type: 'llamada', dir: 'entrante', dur: 140, count: 2 },
    { phone: '6271331238', type: 'llamada', dir: 'entrante', dur: 85, count: 3 },
    { phone: '47288', type: 'sms', dir: 'entrante', dur: 0, count: 3 },
    { phone: 'UNOTV.COM', type: 'sms', dir: 'entrante', dur: 0, count: 7 }
  ];

  const records = [];
  let seq = 1;

  // 1. Generar eventos de llamadas y SMS
  interlocutors.forEach(item => {
    for (let c = 0; c < item.count; c++) {
      const day = 22 + Math.floor(random() * 9); // Del 22 al 30 de enero 2025
      const hour = 8 + Math.floor(random() * 14);
      const min = Math.floor(random() * 60);
      const sec = Math.floor(random() * 60);
      const d = new Date(`2025-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}-07:00`);

      const tower = JUAREZ_CELL_TOWERS[Math.floor(random() * JUAREZ_CELL_TOWERS.length)];

      const isOut = item.dir === 'saliente';
      records.push({
        rec_id: `rec_uayc_${seq++}`,
        import_id: 'imp_uayc_6271218386',
        sheet_label: 'Sábana Objetivo 6271218386 (UAYC)',
        file_hash_sha256: 'SINTETICO_SIN_ARCHIVO',
        expedition_id: expeditionId,
        phone_origin: isOut ? centralTarget : item.phone,
        phone_destination: isOut ? item.phone : centralTarget,
        event_datetime: d.toISOString(),
        event_type: item.type,
        direction: item.dir,
        duration_seconds: item.dur,
        operator: 'Telcel',
        cell_id: tower.cell_id,
        latitude: tower.lat,
        longitude: tower.lng,
        azimuth: tower.azimuth
      });
    }
  });

  // 2. Generar sesiones continuas de Datos GPRS/LTE de 3600 segundos
  for (let day = 22; day <= 30; day++) {
    for (let h = 0; h < 24; h += 4) {
      const d = new Date(`2025-01-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:31:50-07:00`);
      const tower = JUAREZ_CELL_TOWERS[1]; // PRONAF
      records.push({
        rec_id: `rec_uayc_${seq++}`,
        import_id: 'imp_uayc_6271218386',
        sheet_label: 'Sábana Objetivo 6271218386 (UAYC)',
        file_hash_sha256: 'SINTETICO_SIN_ARCHIVO',
        expedition_id: expeditionId,
        phone_origin: centralTarget,
        phone_destination: 'DATOS_INTERNET',
        event_datetime: d.toISOString(),
        event_type: 'datos',
        direction: 'saliente',
        duration_seconds: 3600,
        operator: 'Telcel',
        cell_id: tower.cell_id,
        latitude: tower.lat,
        longitude: tower.lng,
        azimuth: tower.azimuth
      });
    }
  }

  return records.sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));
}

// Ejecución directa por CLI si se invoca con Node.js
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('generate-fake-data')) {
  const records = generateJuarezDemoRecords(1000);
  console.log(`[CDDDM/SABTEL] Generados ${records.length} registros CDR para Ciudad Juárez.`);
  console.log('Muestra:', JSON.stringify(records[0], null, 2));
}
