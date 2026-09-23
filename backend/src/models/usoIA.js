// ============================================================
//  Modelo: uso_ia (registro de consumo de tokens)
// ============================================================
const { getDb } = require('../config/database');

function registrar({ conversacion_id, contacto_id, prompt_tokens, completion_tokens, total_tokens, modelo, estado, error }) {
  getDb().prepare(`
    INSERT INTO uso_ia (conversacion_id, contacto_id, fecha, prompt_tokens, completion_tokens, total_tokens, modelo, estado, error)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    conversacion_id || null, contacto_id || null,
    prompt_tokens || 0, completion_tokens || 0, total_tokens || 0,
    modelo || null, estado || 'ok', error || null
  );
}

// Total de tokens por dia (para dashboard).
function tokensPorDia(dias = 7) {
  return getDb().prepare(`
    SELECT date(fecha) as dia,
           SUM(prompt_tokens) as prompt_tokens,
           SUM(completion_tokens) as completion_tokens,
           SUM(total_tokens) as total_tokens,
           COUNT(*) as llamadas
    FROM uso_ia
    WHERE fecha >= datetime('now', ?)
    GROUP BY date(fecha) ORDER BY dia
  `).all(`-${dias} days`);
}

// Conteo de llamadas IA hoy para una conversacion.
function llamadasHoyPorConversacion(conversacionId) {
  const row = getDb().prepare(`
    SELECT COUNT(*) as n FROM uso_ia
    WHERE conversacion_id = ? AND date(fecha) = date('now')
  `).get(conversacionId);
  return row ? row.n : 0;
}

module.exports = { registrar, tokensPorDia, llamadasHoyPorConversacion };
