// ============================================================
//  Modelo: mensajes_masivos (envio en volumen)
// ============================================================
const { getDb } = require('../config/database');

function listAll() {
  return getDb().prepare('SELECT * FROM mensajes_masivos ORDER BY id DESC').all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM mensajes_masivos WHERE id = ?').get(id);
}

function create(fields) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO mensajes_masivos (nombre, mensaje, contactos_json, enviar_a_todos, template_name, language, archivo_adjunto)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.nombre || 'Mensaje masivo',
    fields.mensaje || '',
    JSON.stringify(fields.contactos || []),
    fields.enviar_a_todos ? 1 : 0,
    fields.template_name || null,
    fields.language || 'es_MX',
    fields.archivo_adjunto ? JSON.stringify(fields.archivo_adjunto) : null
  );
  return findById(info.lastInsertRowid);
}

function update(id, fields) {
  const db = getDb();
  const current = findById(id);
  if (!current) return null;
  const contactosJson = fields.contactos !== undefined
    ? JSON.stringify(fields.contactos) : current.contactos_json;
  const archivoJson = fields.archivo_adjunto !== undefined
    ? (fields.archivo_adjunto ? JSON.stringify(fields.archivo_adjunto) : null) : current.archivo_adjunto;
  db.prepare(`
    UPDATE mensajes_masivos SET
      nombre         = COALESCE(?, nombre),
      mensaje        = COALESCE(?, mensaje),
      contactos_json = ?,
      enviar_a_todos = COALESCE(?, enviar_a_todos),
      template_name  = COALESCE(?, template_name),
      language       = COALESCE(?, language),
      archivo_adjunto = ?,
      updated_at     = datetime('now')
    WHERE id = ?
  `).run(
    fields.nombre ?? null,
    fields.mensaje ?? null,
    contactosJson,
    fields.enviar_a_todos === undefined ? null : (fields.enviar_a_todos ? 1 : 0),
    fields.template_name ?? null,
    fields.language ?? null,
    archivoJson,
    id
  );
  return findById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM mensajes_masivos WHERE id = ?').run(id);
}

function setResultado(id, enviados, fallidos, total) {
  getDb().prepare(`
    UPDATE mensajes_masivos SET
      estado = 'enviado',
      enviados = ?,
      fallidos = ?,
      total = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(enviados, fallidos, total, id);
}

function listForFrontend() {
  return listAll().map(r => ({
    ...r,
    contactos: (() => { try { return JSON.parse(r.contactos_json || '[]'); } catch (_) { return []; } })(),
    enviar_a_todos: !!r.enviar_a_todos,
    archivo_adjunto: (() => { try { return r.archivo_adjunto ? JSON.parse(r.archivo_adjunto) : null; } catch (_) { return null; } })(),
  }));
}

module.exports = { listAll, listForFrontend, findById, create, update, remove, setResultado };
