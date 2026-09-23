// ============================================================
//  Modelo: mensajes
//  direccion: 'in' | 'out'
//  tipo: 'text' | 'interactive' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'template' | 'button'
//  origen: 'bot' | 'ia' | 'humano' | 'webhook' | 'sistema'
//  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
// ============================================================
const { getDb } = require('../config/database');

// Inserta un mensaje. Si wam_id ya existe (dedupe), devuelve null.
function insert({ conversacion_id, contacto_id, wam_id, direccion, tipo, contenido, origen, status, error, reply_to, forwarded_from, forwarded }) {
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO mensajes (conversacion_id, contacto_id, wam_id, direccion, tipo, contenido, origen, status, error, reply_to, forwarded_from, forwarded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversacion_id, contacto_id, wam_id || null,
      direccion, tipo || 'text',
      typeof contenido === 'string' ? contenido : JSON.stringify(contenido || {}),
      origen || 'webhook', status || 'pending', error || null,
      reply_to || null, forwarded_from || null, forwarded ? 1 : 0
    );
    return findById(info.lastInsertRowid);
  } catch (e) {
    // Violacion de UNIQUE(wam_id) => evento duplicado.
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

function findById(id) {
  return getDb().prepare('SELECT * FROM mensajes WHERE id = ?').get(id);
}

function findByWamId(wamId) {
  return getDb().prepare('SELECT * FROM mensajes WHERE wam_id = ?').get(wamId);
}

// Historial de una conversacion (ultimos N).
// Enriquece cada mensaje con reply_to_msg (preview del mensaje citado).
function listByConversacion(conversacionId, limit = 100) {
  const rows = getDb().prepare(
    'SELECT * FROM mensajes WHERE conversacion_id = ? ORDER BY id ASC LIMIT ?'
  ).all(conversacionId, limit);
  return enrichWithReplyTo(rows);
}

// Obtiene multiples mensajes por ID (para reenvio).
function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().prepare(`SELECT * FROM mensajes WHERE id IN (${placeholders})`).all(...ids);
}

// Ultimos N mensajes para contexto de IA (formato {role, content}).
function historialParaIa(conversacionId, limit = 10) {
  const rows = getDb().prepare(
    `SELECT direccion, tipo, contenido FROM mensajes
     WHERE conversacion_id = ? AND tipo IN ('text','interactive','button')
     ORDER BY id DESC LIMIT ?`
  ).all(conversacionId, limit);
  // Invertir a orden cronologico y mapear a roles.
  return rows.reverse().map(r => {
    let content = '';
    try {
      const c = JSON.parse(r.contenido);
      content = c.text || c.body || c.caption || c.title || '';
    } catch (_) { content = r.contenido; }
    return { role: r.direccion === 'in' ? 'user' : 'assistant', content };
  }).filter(m => m.content);
}

function updateStatus(wamId, status) {
  getDb().prepare('UPDATE mensajes SET status = ? WHERE wam_id = ?').run(status, wamId);
}

function marcarLeidos(conversacionId) {
  getDb().prepare(
    `UPDATE mensajes SET status = 'read' WHERE conversacion_id = ? AND direccion = 'in' AND status = 'delivered'`
  ).run(conversacionId);
}

// Enriquece una lista de mensajes con el preview del mensaje citado (reply_to_msg).
function enrichWithReplyTo(rows) {
  const replyIds = rows.filter(r => r.reply_to).map(r => r.reply_to);
  const replyMap = {};
  if (replyIds.length > 0) {
    const uniqueIds = [...new Set(replyIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const repliedRows = getDb().prepare(
      `SELECT id, direccion, tipo, contenido, origen FROM mensajes WHERE id IN (${placeholders})`
    ).all(...uniqueIds);
    for (const r of repliedRows) {
      let texto = '';
      try {
        const c = JSON.parse(r.contenido);
        texto = c.text || c.body || c.caption || c.title || c.filename || '[' + r.tipo + ']';
      } catch (_) { texto = '[' + r.tipo + ']'; }
      replyMap[r.id] = { id: r.id, direccion: r.direccion, tipo: r.tipo, texto, origen: r.origen };
    }
  }
  return rows.map(r => ({
    ...r,
    reply_to_msg: r.reply_to ? (replyMap[r.reply_to] || { id: r.reply_to, texto: 'Mensaje no disponible', tipo: 'text', direccion: 'in' }) : null,
  }));
}

module.exports = { insert, findById, findByWamId, listByConversacion, findByIds, historialParaIa, updateStatus, marcarLeidos };
