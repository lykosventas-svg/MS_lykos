// ============================================================
//  Cifrado AES-256-GCM de credenciales sensibles en la BD
//  Formato almacenado: "iv:authTag:ciphertext" (todo en hex)
// ============================================================
const crypto = require('crypto');
const env = require('./env');

const ALGO = 'aes-256-gcm';

// Deriva el buffer de 32 bytes desde la clave hex.
function getKey() {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

// Cifra un texto plano -> "iv:authTag:ciphertext"
function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(String(plain), 'utf8', 'hex');
  enc += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${enc}`;
}

// Descifra "iv:authTag:ciphertext" -> texto plano
function decrypt(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const enc = parts[2];
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

// Enmascara un texto para mostrar en UI sin revelarlo (ej: "abcd...wxyz")
function mask(plain) {
  if (!plain) return '';
  const s = String(plain);
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '••••' + s.slice(-4);
}

module.exports = { encrypt, decrypt, mask };
