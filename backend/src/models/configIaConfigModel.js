// ============================================================
//  Modelo: config_ia_configs (CRUD multiple configs de IA)
// ============================================================
const { getDb } = require('../config/database');
const { encrypt, decrypt, mask } = require('../config/encryption');

function listAll() {
  return getDb().prepare('SELECT * FROM config_ia_configs ORDER BY id').all();
}

function listForFrontend() {
  return listAll().map(r => ({
    ...r,
    activo: !!r.activo,
    has_api_key: !!r.api_key_enc,
    api_key_masked: decrypt(r.api_key_enc) ? mask(decrypt(r.api_key_enc)) : '',
  }));
}

function findById(id) {
  return getDb().prepare('SELECT * FROM config_ia_configs WHERE id = ?').get(id);
}

function getRaw(id) {
  const row = findById(id);
  if (!row) return null;
  return { ...row, activo: !!row.activo, api_key: decrypt(row.api_key_enc) };
}

// Devuelve la config activa (descifrada) o null.
function getActive() {
  const row = getDb().prepare('SELECT * FROM config_ia_configs WHERE activo = 1 LIMIT 1').get();
  if (!row) return null;
  return { ...row, api_key: decrypt(row.api_key_enc) };
}

function create(fields) {
  const db = getDb();
  const apiKeyEnc = fields.api_key ? encrypt(fields.api_key) : null;
  if (fields.activo) db.prepare('UPDATE config_ia_configs SET activo = 0').run();
  const info = db.prepare(`
    INSERT INTO config_ia_configs (nombre, descripcion, activo, ia_mode, base_url, api_key_enc, model_name, temperature, max_tokens, system_prompt, max_messages_per_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.nombre || 'IA 1',
    fields.descripcion || null,
    fields.activo ? 1 : 0,
    fields.ia_mode || 'respaldo',
    fields.base_url || null,
    apiKeyEnc,
    fields.model_name || 'glm-5.2',
    fields.temperature ?? 0.4,
    fields.max_tokens ?? 300,
    fields.system_prompt || null,
    fields.max_messages_per_day ?? 50
  );
  return findById(info.lastInsertRowid);
}

function update(id, fields) {
  const db = getDb();
  const current = findById(id);
  if (!current) return null;
  const apiKeyEnc = (fields.api_key && fields.api_key.trim() !== '')
    ? encrypt(fields.api_key) : current.api_key_enc;
  if (fields.activo) db.prepare('UPDATE config_ia_configs SET activo = 0').run();
  db.prepare(`
    UPDATE config_ia_configs SET
      nombre               = COALESCE(?, nombre),
      descripcion          = COALESCE(?, descripcion),
      activo               = COALESCE(?, activo),
      ia_mode              = COALESCE(?, ia_mode),
      base_url             = COALESCE(?, base_url),
      api_key_enc          = ?,
      model_name           = COALESCE(?, model_name),
      temperature          = COALESCE(?, temperature),
      max_tokens           = COALESCE(?, max_tokens),
      system_prompt        = COALESCE(?, system_prompt),
      max_messages_per_day = COALESCE(?, max_messages_per_day),
      updated_at           = datetime('now')
    WHERE id = ?
  `).run(
    fields.nombre ?? null,
    fields.descripcion ?? null,
    fields.activo === undefined ? null : (fields.activo ? 1 : 0),
    fields.ia_mode ?? null,
    fields.base_url ?? null,
    apiKeyEnc,
    fields.model_name ?? null,
    fields.temperature ?? null,
    fields.max_tokens ?? null,
    fields.system_prompt ?? null,
    fields.max_messages_per_day ?? null,
    id
  );
  return findById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM config_ia_configs WHERE id = ?').run(id);
}

// Activa una config y desactiva las demas.
function activate(id) {
  const db = getDb();
  db.prepare('UPDATE config_ia_configs SET activo = 0').run();
  db.prepare("UPDATE config_ia_configs SET activo = 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

function setCheckResult(id, result) {
  getDb().prepare("UPDATE config_ia_configs SET last_check_at = datetime('now'), last_check_result = ? WHERE id = ?").run(result, id);
}

module.exports = { listAll, listForFrontend, findById, getRaw, getActive, create, update, remove, activate, setCheckResult };
