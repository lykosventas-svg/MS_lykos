// ============================================================
//  Logger minimalista (consola + tabla logs_api en BD)
// ============================================================
const { getDb } = require('../config/database');

const COLORS = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' };

function fmt(level, msg) {
  const ts = new Date().toISOString();
  return `${COLORS[level] || ''}[${ts}] [${level.toUpperCase()}]${COLORS.reset} ${msg}`;
}

// Log a consola y opcionalmente a la tabla logs_api.
// origen: 'whatsapp' | 'ia' | 'sistema'
function log(level, msg, detalle = null, origen = 'sistema', persist = true) {
  console.log(fmt(level, msg));
  if (persist) {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO logs_api (origen, nivel, mensaje, detalle) VALUES (?, ?, ?, ?)`
      ).run(origen, level, String(msg).slice(0, 1000), detalle ? JSON.stringify(detalle) : null);
    } catch (_) {
      // BD no lista o tabla inexistente: ignorar (no romper el log).
    }
  }
}

module.exports = {
  info: (m, d, o, p) => log('info', m, d, o, p),
  warn: (m, d, o, p) => log('warn', m, d, o, p),
  error: (m, d, o, p) => log('error', m, d, o, p),
};
