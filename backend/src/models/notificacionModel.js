// ============================================================
//  Modelo: notificaciones (config global + config por usuario + log)
// ============================================================
const { getDb } = require('../config/database');
const { encrypt, decrypt, mask } = require('../config/encryption');

// ---------- CONFIG GLOBAL ----------

function ensureGlobalRow() {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM config_notificaciones WHERE id = 1').get();
  if (!exists) db.prepare('INSERT INTO config_notificaciones (id) VALUES (1)').run();
}

function getGlobalRaw() {
  ensureGlobalRow();
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_notificaciones WHERE id = 1').get();
  return { ...row, smtp_pass: decrypt(row.smtp_pass_enc) };
}

function getGlobalFrontend() {
  const raw = getGlobalRaw();
  return {
    url_software: raw.url_software || '',
    mensaje_default: raw.mensaje_default || '',
    smtp_host: raw.smtp_host || '',
    smtp_port: raw.smtp_port || 587,
    smtp_user: raw.smtp_user || '',
    has_smtp_pass: !!raw.smtp_pass_enc,
    smtp_pass_masked: raw.smtp_pass ? mask(raw.smtp_pass) : '',
    smtp_from: raw.smtp_from || '',
    smtp_activado: !!raw.smtp_activado,
  };
}

function saveGlobal(fields) {
  ensureGlobalRow();
  const db = getDb();
  const current = getGlobalRaw();
  const passEnc = (fields.smtp_pass && fields.smtp_pass.trim() !== '')
    ? encrypt(fields.smtp_pass) : current.smtp_pass_enc;
  db.prepare(`
    UPDATE config_notificaciones SET
      url_software    = COALESCE(?, url_software),
      mensaje_default = COALESCE(?, mensaje_default),
      smtp_host       = COALESCE(?, smtp_host),
      smtp_port       = COALESCE(?, smtp_port),
      smtp_user       = COALESCE(?, smtp_user),
      smtp_pass_enc   = ?,
      smtp_from       = COALESCE(?, smtp_from),
      smtp_activado   = COALESCE(?, smtp_activado),
      updated_at      = datetime('now')
    WHERE id = 1
  `).run(
    fields.url_software ?? null,
    fields.mensaje_default ?? null,
    fields.smtp_host ?? null,
    fields.smtp_port ?? null,
    fields.smtp_user ?? null,
    passEnc,
    fields.smtp_from ?? null,
    fields.smtp_activado === undefined ? null : (fields.smtp_activado ? 1 : 0)
  );
  return getGlobalFrontend();
}

// ---------- CONFIG POR USUARIO ----------

function getByUsuario(usuarioId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM notificaciones_config WHERE usuario_id = ?').get(usuarioId);
  if (!row) {
    db.prepare('INSERT INTO notificaciones_config (usuario_id) VALUES (?)').run(usuarioId);
    row = db.prepare('SELECT * FROM notificaciones_config WHERE usuario_id = ?').get(usuarioId);
  }
  return row;
}

function listAll() {
  const db = getDb();
  return db.prepare(`
    SELECT u.id as usuario_id, u.username, u.nombre, u.role, u.activo,
           nc.id as config_id, nc.activado, nc.email, nc.whatsapp_personal,
           nc.mensaje_personalizado, nc.recurrencia_activada, nc.recurrencia_minutos,
           nc.ultimo_envio, nc.recurrencia_detenida
    FROM usuarios u
    LEFT JOIN notificaciones_config nc ON nc.usuario_id = u.id
    ORDER BY u.id
  `).all();
}

function saveUsuario(usuarioId, fields) {
  getByUsuario(usuarioId); // ensure exists
  const db = getDb();

  // Si se desactivan las notificaciones, forzar tambien desactivar la recurrencia.
  const activadoVal = fields.activado === undefined ? null : (fields.activado ? 1 : 0);
  let recurrenciaVal = fields.recurrencia_activada === undefined ? null : (fields.recurrencia_activada ? 1 : 0);
  if (activadoVal === 0) recurrenciaVal = 0; // desactivar recurrencia si notificaciones off

  db.prepare(`
    UPDATE notificaciones_config SET
      activado             = COALESCE(?, activado),
      email                = COALESCE(?, email),
      whatsapp_personal    = COALESCE(?, whatsapp_personal),
      mensaje_personalizado = COALESCE(?, mensaje_personalizado),
      recurrencia_activada = COALESCE(?, recurrencia_activada),
      recurrencia_minutos  = COALESCE(?, recurrencia_minutos),
      updated_at           = datetime('now')
    WHERE usuario_id = ?
  `).run(
    activadoVal,
    fields.email ?? null,
    fields.whatsapp_personal ?? null,
    fields.mensaje_personalizado ?? null,
    recurrenciaVal,
    fields.recurrencia_minutos ?? null,
    usuarioId
  );
  return getByUsuario(usuarioId);
}

// Marca que el usuario inicio sesion -> detener recurrencia
function detenerRecurrencia(usuarioId) {
  const db = getDb();
  db.prepare(`
    UPDATE notificaciones_config SET recurrencia_detenida = 1, updated_at = datetime('now')
    WHERE usuario_id = ?
  `).run(usuarioId);
}

// Reactiva la recurrencia (cuando llega un mensaje nuevo)
function reactivarRecurrencia(usuarioId) {
  const db = getDb();
  db.prepare(`
    UPDATE notificaciones_config SET recurrencia_detenida = 0, updated_at = datetime('now')
    WHERE usuario_id = ?
  `).run(usuarioId);
}

// Actualiza el timestamp del ultimo envio
function setUltimoEnvio(usuarioId) {
  getDb().prepare(`
    UPDATE notificaciones_config SET ultimo_envio = datetime('now'), updated_at = datetime('now')
    WHERE usuario_id = ?
  `).run(usuarioId);
}

// Devuelve usuarios con notificaciones activas y recurrencia pendiente
function getPendientesRecurrencia() {
  const db = getDb();
  return db.prepare(`
    SELECT nc.*, u.username, u.nombre
    FROM notificaciones_config nc
    JOIN usuarios u ON u.id = nc.usuario_id
    WHERE nc.activado = 1
      AND nc.recurrencia_activada = 1
      AND nc.recurrencia_detenida = 0
      AND u.activo = 1
      AND (nc.ultimo_envio IS NULL OR datetime('now', '-' || nc.recurrencia_minutos || ' minutes') >= datetime(ultimo_envio))
  `).all();
}

// Devuelve usuarios con notificaciones activas (para envio inicial)
function getActivos() {
  const db = getDb();
  return db.prepare(`
    SELECT nc.*, u.username, u.nombre
    FROM notificaciones_config nc
    JOIN usuarios u ON u.id = nc.usuario_id
    WHERE nc.activado = 1 AND u.activo = 1
  `).all();
}

// ---------- LOG ----------

function logEnvio({ usuario_id, via, destino, mensaje, estado, error }) {
  getDb().prepare(`
    INSERT INTO notificaciones_log (usuario_id, via, destino, mensaje, estado, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(usuario_id || null, via, destino, mensaje || '', estado || 'ok', error || null);
}

function listLog(limit = 50) {
  return getDb().prepare(`
    SELECT nl.*, u.username
    FROM notificaciones_log nl
    LEFT JOIN usuarios u ON u.id = nl.usuario_id
    ORDER BY nl.id DESC LIMIT ?
  `).all(limit);
}

module.exports = {
  getGlobalRaw, getGlobalFrontend, saveGlobal,
  getByUsuario, listAll, saveUsuario,
  detenerRecurrencia, reactivarRecurrencia, setUltimoEnvio,
  getPendientesRecurrencia, getActivos,
  logEnvio, listLog,
};
