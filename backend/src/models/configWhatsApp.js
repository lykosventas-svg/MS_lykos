// ============================================================
//  Modelo: config_whatsapp (credenciales WhatsApp Cloud API)
//  El token se guarda CIFRADO; se descifra solo en servicios.
// ============================================================
const { getDb } = require('../config/database');
const { encrypt, decrypt, mask } = require('../config/encryption');

// Asegura que exista la fila singleton (id=1).
function ensureRow() {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM config_whatsapp WHERE id = 1').get();
  if (!exists) {
    db.prepare(`INSERT INTO config_whatsapp (id) VALUES (1)`).run();
  }
}

// Devuelve la configuracion (token descifrado incluido, solo para backend).
function getRaw() {
  ensureRow();
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_whatsapp WHERE id = 1').get();
  return {
    ...row,
    access_token: decrypt(row.access_token_enc),
    app_secret: decrypt(row.app_secret_enc),
  };
}

// Devuelve la configuracion para el FRONTEND (token enmascarado, nunca el real).
function getForFrontend() {
  const raw = getRaw();
  return {
    phone_number_id: raw.phone_number_id || '',
    waba_id: raw.waba_id || '',
    has_token: !!raw.access_token_enc,
    token_masked: raw.access_token ? mask(raw.access_token) : '',
    has_app_secret: !!raw.app_secret_enc,
    app_secret_masked: raw.app_secret ? mask(raw.app_secret) : '',
    graph_api_version: raw.graph_api_version || 'v19.0',
    verify_token: raw.verify_token || '',
    public_url: raw.public_url || '',
    webhook_verified: !!raw.webhook_verified,
    token_valid: !!raw.token_valid,
    token_expires_at: raw.token_expires_at || null,
    last_check_at: raw.last_check_at || null,
    last_check_result: raw.last_check_result || null,
  };
}

// Guarda la configuracion de WhatsApp.
// Si newToken viene vacio, se conserva el token anterior (no se sobreescribe).
function save({ phone_number_id, waba_id, access_token, app_secret, graph_api_version, verify_token, public_url }) {
  ensureRow();
  const db = getDb();
  const current = getRaw();

  const tokenEnc = (access_token && access_token.trim() !== '')
    ? encrypt(access_token)
    : current.access_token_enc; // conservar anterior si viene vacio

  const secretEnc = (app_secret && app_secret.trim() !== '')
    ? encrypt(app_secret)
    : current.app_secret_enc; // conservar anterior si viene vacio

  db.prepare(`
    UPDATE config_whatsapp SET
      phone_number_id    = COALESCE(?, phone_number_id),
      waba_id            = COALESCE(?, waba_id),
      access_token_enc   = ?,
      app_secret_enc     = ?,
      graph_api_version  = COALESCE(?, graph_api_version),
      verify_token       = COALESCE(?, verify_token),
      public_url         = COALESCE(?, public_url),
      updated_at         = datetime('now')
    WHERE id = 1
  `).run(
    phone_number_id ?? null,
    waba_id ?? null,
    tokenEnc,
    secretEnc,
    graph_api_version ?? null,
    verify_token ?? null,
    public_url ?? null
  );
  return getForFrontend();
}

// Marca el resultado de la verificacion del webhook.
function setWebhookVerified(verified) {
  ensureRow();
  getDb().prepare(`UPDATE config_whatsapp SET webhook_verified = ?, updated_at = datetime('now') WHERE id = 1`)
    .run(verified ? 1 : 0);
}

// Guarda el resultado de la ultima prueba de conexion.
function setCheckResult({ token_valid, token_expires_at, result }) {
  ensureRow();
  getDb().prepare(`
    UPDATE config_whatsapp SET
      token_valid = ?, token_expires_at = ?, last_check_at = datetime('now'),
      last_check_result = ?, updated_at = datetime('now') WHERE id = 1
  `).run(token_valid ? 1 : 0, token_expires_at || null, result || null);
}

module.exports = { getRaw, getForFrontend, save, setWebhookVerified, setCheckResult };
