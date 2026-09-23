// ============================================================
//  Modelo: config_ia (configuracion de inteligencia artificial)
//  api_key se guarda CIFRADA; se descifra solo en servicios.
// ============================================================
const { getDb } = require('../config/database');
const { encrypt, decrypt, mask } = require('../config/encryption');

function ensureRow() {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM config_ia WHERE id = 1').get();
  if (!exists) db.prepare(`INSERT INTO config_ia (id) VALUES (1)`).run();
}

// Configuracion completa para backend (api_key descifrada).
function getRaw() {
  ensureRow();
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_ia WHERE id = 1').get();
  return { ...row, api_key: decrypt(row.api_key_enc) };
}

// Configuracion para frontend (api_key enmascarada).
function getForFrontend() {
  const raw = getRaw();
  return {
    ia_enabled: !!raw.ia_enabled,
    ia_mode: raw.ia_mode || 'respaldo',
    base_url: raw.base_url || '',
    has_api_key: !!raw.api_key_enc,
    api_key_masked: raw.api_key ? mask(raw.api_key) : '',
    model_name: raw.model_name || 'glm-5.2',
    temperature: raw.temperature ?? 0.4,
    max_tokens: raw.max_tokens ?? 300,
    system_prompt: raw.system_prompt || '',
    max_messages_per_day: raw.max_messages_per_day ?? 50,
    last_check_at: raw.last_check_at || null,
    last_check_result: raw.last_check_result || null,
  };
}

// Guarda la configuracion de IA. api_key vacio => conserva la anterior.
function save(fields) {
  ensureRow();
  const db = getDb();
  const current = getRaw();

  const apiKeyEnc = (fields.api_key && fields.api_key.trim() !== '')
    ? encrypt(fields.api_key)
    : current.api_key_enc;

  db.prepare(`
    UPDATE config_ia SET
      ia_enabled           = COALESCE(?, ia_enabled),
      ia_mode              = COALESCE(?, ia_mode),
      base_url             = COALESCE(?, base_url),
      api_key_enc          = ?,
      model_name           = COALESCE(?, model_name),
      temperature          = COALESCE(?, temperature),
      max_tokens           = COALESCE(?, max_tokens),
      system_prompt        = COALESCE(?, system_prompt),
      max_messages_per_day = COALESCE(?, max_messages_per_day),
      updated_at           = datetime('now')
    WHERE id = 1
  `).run(
    fields.ia_enabled === undefined ? null : (fields.ia_enabled ? 1 : 0),
    fields.ia_mode ?? null,
    fields.base_url ?? null,
    apiKeyEnc,
    fields.model_name ?? null,
    fields.temperature ?? null,
    fields.max_tokens ?? null,
    fields.system_prompt ?? null,
    fields.max_messages_per_day ?? null
  );
  return getForFrontend();
}

// Guarda el resultado de la ultima prueba de conexion IA.
function setCheckResult(result) {
  ensureRow();
  getDb().prepare(`
    UPDATE config_ia SET last_check_at = datetime('now'), last_check_result = ?, updated_at = datetime('now') WHERE id = 1
  `).run(result || null);
}

module.exports = { getRaw, getForFrontend, save, setCheckResult };
