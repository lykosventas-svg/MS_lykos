// ============================================================
//  Modelo: usuarios (admin y agentes)
// ============================================================
const { getDb } = require('../config/database');
const bcrypt = require('bcryptjs');

function findByUsername(username) {
  return getDb().prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(username);
}

function findById(id) {
  return getDb().prepare('SELECT id, username, role, nombre, activo, created_at FROM usuarios WHERE id = ?').get(id);
}

function listAll() {
  return getDb().prepare('SELECT id, username, role, nombre, activo, created_at FROM usuarios ORDER BY id').all();
}

function create({ username, password, role, nombre }) {
  const hash = bcrypt.hashSync(password, 10);
  const info = getDb().prepare(
    `INSERT INTO usuarios (username, password_hash, role, nombre) VALUES (?, ?, ?, ?)`
  ).run(username, hash, role || 'agente', nombre || username);
  return findById(info.lastInsertRowid);
}

function updatePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  getDb().prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, id);
}

function setActivo(id, activo) {
  getDb().prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
}

// Actualiza username, nombre y/o rol de un usuario.
function update(id, { username, nombre, role }) {
  getDb().prepare(`
    UPDATE usuarios SET
      username = COALESCE(?, username),
      nombre   = COALESCE(?, nombre),
      role     = COALESCE(?, role)
     WHERE id = ?
  `).run(username ?? null, nombre ?? null, role ?? null, id);
  return findById(id);
}

// Elimina un usuario. Devuelve false si es el ultimo admin (no se puede borrar).
function remove(id) {
  const db = getDb();
  const user = findById(id);
  if (!user) return false;
  // No permitir eliminar al ultimo admin activo.
  if (user.role === 'admin' && user.activo) {
    const adminCount = db.prepare('SELECT COUNT(*) as n FROM usuarios WHERE role = ? AND activo = 1').get('admin').n;
    if (adminCount <= 1) return false;
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  return true;
}

// Cuenta cuantos admins activos hay (para validacion en el frontend).
function countAdmins() {
  return getDb().prepare('SELECT COUNT(*) as n FROM usuarios WHERE role = ? AND activo = 1').get('admin').n;
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function setSession(id, sessionId, ip, device) {
  getDb().prepare(`
    UPDATE usuarios SET
      session_id = ?,
      session_ip = ?,
      session_device = ?,
      session_started_at = datetime('now')
    WHERE id = ?
  `).run(sessionId, ip || null, device || null, id);
}

function clearSession(id) {
  getDb().prepare(`
    UPDATE usuarios SET
      session_id = NULL,
      session_ip = NULL,
      session_device = NULL,
      session_started_at = NULL
    WHERE id = ?
  `).run(id);
}

function getSessionId(id) {
  const row = getDb().prepare('SELECT session_id FROM usuarios WHERE id = ?').get(id);
  return row ? row.session_id : null;
}

module.exports = { findByUsername, findById, listAll, create, update, updatePassword, setActivo, remove, countAdmins, verifyPassword, setSession, clearSession, getSessionId };
