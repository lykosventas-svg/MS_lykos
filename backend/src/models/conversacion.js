// ============================================================
//  Modelo: conversaciones
//  modo: 'bot' | 'ia' | 'humano'
//  estado: 'activa' | 'cerrada' | 'pendiente'
// ============================================================
const { getDb } = require('../config/database');

function findById(id) {
  return getDb().prepare('SELECT * FROM conversaciones WHERE id = ?').get(id);
}

function findByContacto(contactoId) {
  return getDb().prepare('SELECT * FROM conversaciones WHERE contacto_id = ? ORDER BY id DESC LIMIT 1').get(contactoId);
}

// Obtiene o crea la conversacion activa de un contacto.
// FIX: busca cualquier conversacion no cerrada (no solo 'activa')
// para evitar conversaciones duplicadas cuando el estado es 'pendiente'.
function getOrCreate(contactoId) {
  const db = getDb();
  let conv = db.prepare(
    `SELECT * FROM conversaciones WHERE contacto_id = ? AND estado != 'cerrada' ORDER BY id DESC LIMIT 1`
  ).get(contactoId);
  if (!conv) {
    // Determinar modo inicial desde config_bot.modo_inicio ('bot' o 'ia').
    // Si modo_inicio='none', el orquestador se encarga de poner modo 'humano'.
    let modoInicial = 'bot';
    try {
      const configBotModel = require('./configBot');
      const cfgBot = configBotModel.getConfig();
      if (cfgBot.modo_inicio === 'ia') modoInicial = 'ia';
    } catch (_) {}
    const info = db.prepare(
      `INSERT INTO conversaciones (contacto_id, modo, estado, ventana_24h_hasta)
       VALUES (?, ?, 'activa', datetime('now','+24 hours'))`
    ).run(contactoId, modoInicial);
    conv = findById(info.lastInsertRowid);
  }
  return conv;
}

function setModo(id, modo) {
  // No permitir volver a 'bot' si ya ocurrio handoff a humano.
  if (modo === 'bot') {
    const conv = findById(id);
    if (conv && conv.handoff_ocurrido) return conv;
  }
  getDb().prepare('UPDATE conversaciones SET modo = ?, updated_at = datetime(\'now\') WHERE id = ?').run(modo, id);
  return findById(id);
}

function setAgente(id, agenteId) {
  getDb().prepare('UPDATE conversaciones SET agente_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(agenteId, id);
  return findById(id);
}

function setEstado(id, estado) {
  getDb().prepare('UPDATE conversaciones SET estado = ?, updated_at = datetime(\'now\') WHERE id = ?').run(estado, id);
  return findById(id);
}

function setPasoFlujo(id, paso) {
  getDb().prepare('UPDATE conversaciones SET paso_flujo = ?, updated_at = datetime(\'now\') WHERE id = ?').run(paso, id);
}

function setDatosSesion(id, datos) {
  getDb().prepare('UPDATE conversaciones SET datos_sesion = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(datos || {}), id);
}

function getDatosSesion(id) {
  const row = getDb().prepare('SELECT datos_sesion FROM conversaciones WHERE id = ?').get(id);
  try { return JSON.parse(row?.datos_sesion || '{}'); } catch (_) { return {}; }
}

// Reinicia el contador de mensajes IA si cambio el dia.
function refreshContadorIa(id) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT contador_ia_fecha, mensajes_ia_hoy FROM conversaciones WHERE id = ?').get(id);
  if (row && row.contador_ia_fecha !== today) {
    db.prepare('UPDATE conversaciones SET mensajes_ia_hoy = 0, contador_ia_fecha = ? WHERE id = ?').run(today, id);
  }
}

function incrementarContadorIa(id) {
  refreshContadorIa(id);
  getDb().prepare('UPDATE conversaciones SET mensajes_ia_hoy = mensajes_ia_hoy + 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
}

function getContadorIa(id) {
  refreshContadorIa(id);
  const row = getDb().prepare('SELECT mensajes_ia_hoy FROM conversaciones WHERE id = ?').get(id);
  return row ? row.mensajes_ia_hoy : 0;
}

function renovarVentana24h(id) {
  getDb().prepare('UPDATE conversaciones SET ventana_24h_hasta = datetime(\'now\',\'+24 hours\'), updated_at = datetime(\'now\') WHERE id = ?').run(id);
}

function tocar(id) {
  getDb().prepare('UPDATE conversaciones SET ultima_actividad = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(id);
}

// Lista conversaciones con filtro de modo/estado/agente.
function list({ modo, estado, agenteId, soloMias, limit = 100 } = {}) {
  let sql = `
    SELECT c.*, ct.wa_id, ct.nombre as contacto_nombre, ct.deleted as contacto_deleted,
           u.username as agente_username,
           (SELECT COUNT(*) FROM mensajes m WHERE m.conversacion_id = c.id AND m.direccion = 'in' AND m.status = 'delivered') as sin_leer,
           (SELECT COALESCE(
             json_extract(m.contenido, '$.text'),
             json_extract(m.contenido, '$.body'),
             json_extract(m.contenido, '$.caption'),
             json_extract(m.contenido, '$.title'),
             ''
           ) FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) as ultimo_mensaje
    FROM conversaciones c
    LEFT JOIN contactos ct ON ct.id = c.contacto_id
    LEFT JOIN usuarios u ON u.id = c.agente_id
    WHERE 1=1
  `;
  const params = [];
  if (modo) { sql += ' AND c.modo = ?'; params.push(modo); }
  if (estado) { sql += ' AND c.estado = ?'; params.push(estado); }
  if (soloMias && agenteId) { sql += ' AND c.agente_id = ?'; params.push(agenteId); }
  sql += ' ORDER BY c.ultima_actividad DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params);
}

function remove(id) {
  getDb().prepare('DELETE FROM conversaciones WHERE id = ?').run(id);
}

function setBotCompletado(id) {
  getDb().prepare('UPDATE conversaciones SET bot_completado = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
}

function isBotCompletado(id) {
  const row = getDb().prepare('SELECT bot_completado FROM conversaciones WHERE id = ?').get(id);
  return row ? row.bot_completado === 1 : false;
}

module.exports = {
  findById, findByContacto, getOrCreate,
  setModo, setAgente, setEstado, setPasoFlujo, setDatosSesion, getDatosSesion,
  refreshContadorIa, incrementarContadorIa, getContadorIa,
  renovarVentana24h, tocar, list, remove,
  setBotCompletado, isBotCompletado,
};
