// ============================================================
//  Modelo: contactos
// ============================================================
const { getDb } = require('../config/database');

function findByWaId(waId) {
  return getDb().prepare('SELECT * FROM contactos WHERE wa_id = ?').get(waId);
}

function findById(id) {
  return getDb().prepare('SELECT * FROM contactos WHERE id = ?').get(id);
}

// Crea o actualiza un contacto por wa_id. Devuelve el contacto.
// NO restaura contactos soft-deleted automáticamente; el usuario debe
// restaurarlos manualmente con el botón "Agregar" en el menú de 3 puntos.
function upsert({ wa_id, nombre }) {
  const db = getDb();
  const existing = findByWaId(wa_id);
  if (existing) {
    if (nombre && nombre !== existing.nombre) {
      db.prepare('UPDATE contactos SET nombre = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(nombre, existing.id);
    }
    return findById(existing.id);
  }
  const info = db.prepare(
    'INSERT INTO contactos (wa_id, nombre) VALUES (?, ?)'
  ).run(wa_id, nombre || null);
  return findById(info.lastInsertRowid);
}

function listAll({ search, limit = 100, includeDeleted = false } = {}) {
  const filter = includeDeleted ? '' : ' AND deleted = 0';
  if (search) {
    return getDb().prepare(
      `SELECT * FROM contactos WHERE (wa_id LIKE ? OR nombre LIKE ?)${filter} ORDER BY updated_at DESC LIMIT ?`
    ).all(`%${search}%`, `%${search}%`, limit);
  }
  return getDb().prepare(`SELECT * FROM contactos WHERE 1=1${filter} ORDER BY updated_at DESC LIMIT ?`).all(limit);
}

function updateTags(id, etiquetas) {
  getDb().prepare('UPDATE contactos SET etiquetas = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(etiquetas || []), id);
  return findById(id);
}

function updateNotas(id, notas) {
  getDb().prepare('UPDATE contactos SET notas = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(notas, id);
  return findById(id);
}

function updateName(id, nombre) {
  getDb().prepare('UPDATE contactos SET nombre = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(nombre, id);
  return findById(id);
}

function softDelete(id) {
  getDb().prepare('UPDATE contactos SET deleted = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  return findById(id);
}

function restore(id) {
  getDb().prepare('UPDATE contactos SET deleted = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  return findById(id);
}

module.exports = { findByWaId, findById, upsert, listAll, updateTags, updateNotas, updateName, softDelete, restore };
