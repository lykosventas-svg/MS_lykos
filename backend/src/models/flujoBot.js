// ============================================================
//  Modelo: flujos_bot (CRUD de flujos de bot)
// ============================================================
const { getDb } = require('../config/database');

function listAll() {
  return getDb().prepare('SELECT * FROM flujos_bot ORDER BY id DESC').all();
}

function listForFrontend() {
  return listAll().map(r => ({
    ...r,
    activo: !!r.activo,
    flujo: (() => { try { return JSON.parse(r.flujo_json || '{}'); } catch (_) { return {}; } })(),
  }));
}

function findById(id) {
  return getDb().prepare('SELECT * FROM flujos_bot WHERE id = ?').get(id);
}

function getActive() {
  const row = getDb().prepare('SELECT * FROM flujos_bot WHERE activo = 1 LIMIT 1').get();
  if (!row) return null;
  try { return { ...row, flujo: JSON.parse(row.flujo_json || '{}') }; }
  catch (_) { return { ...row, flujo: {} }; }
}

function create(fields) {
  const db = getDb();
  if (fields.activo) db.prepare('UPDATE flujos_bot SET activo = 0').run();
  const info = db.prepare(`
    INSERT INTO flujos_bot (nombre, descripcion, activo, flujo_json)
    VALUES (?, ?, ?, ?)
  `).run(
    fields.nombre || 'Flujo Bot',
    fields.descripcion || null,
    fields.activo ? 1 : 0,
    JSON.stringify(fields.flujo || {})
  );
  return findById(info.lastInsertRowid);
}

function update(id, fields) {
  const db = getDb();
  const current = findById(id);
  if (!current) return null;
  if (fields.activo) db.prepare('UPDATE flujos_bot SET activo = 0').run();
  const flujoJson = fields.flujo !== undefined ? JSON.stringify(fields.flujo) : current.flujo_json;
  db.prepare(`
    UPDATE flujos_bot SET
      nombre      = COALESCE(?, nombre),
      descripcion = COALESCE(?, descripcion),
      activo      = COALESCE(?, activo),
      flujo_json  = ?,
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(
    fields.nombre ?? null,
    fields.descripcion ?? null,
    fields.activo === undefined ? null : (fields.activo ? 1 : 0),
    flujoJson,
    id
  );
  return findById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM flujos_bot WHERE id = ?').run(id);
}

function activate(id) {
  const db = getDb();
  db.prepare('UPDATE flujos_bot SET activo = 0').run();
  db.prepare("UPDATE flujos_bot SET activo = 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

function deactivateAll() {
  getDb().prepare('UPDATE flujos_bot SET activo = 0').run();
}

module.exports = { listAll, listForFrontend, findById, getActive, create, update, remove, activate, deactivateAll };
