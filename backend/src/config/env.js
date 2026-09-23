// ============================================================
//  Carga y validacion de variables de entorno
// ============================================================
require('dotenv').config();
const crypto = require('crypto');

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:3000',
  DB_PATH: process.env.DB_PATH || './data/lykos.db',

  JWT_SECRET: process.env.JWT_SECRET || 'lykos-dev-secret-cambiar',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',

  // Clave de cifrado: 32 bytes en hex. Si no esta, se genera una efimera
  // (las credenciales cifradas no sobreviviran a reinicios -> se reingresan).
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',

  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN || 'lykos_verify_token_inicial',

  // CORS: '*' para dev, o lista de origenes separados por coma para produccion.
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Timeout de inactividad de sesion (minutos). 0 = deshabilitado.
  SESSION_IDLE_TIMEOUT_MINUTES: parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10),
};

// Si no hay ENCRYPTION_KEY, generamos una efimera y avisamos por consola.
if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length !== 64) {
  env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  env.ENCRYPTION_KEY_EPHEMERAL = true;
}

module.exports = env;
