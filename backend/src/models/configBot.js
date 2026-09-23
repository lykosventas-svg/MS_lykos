// ============================================================
//  Modelo: config_bot (flujos/menus del modo BOT sin IA)
// ============================================================
const { getDb } = require('../config/database');

function ensureRow() {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM config_bot WHERE id = 1').get();
  if (!exists) db.prepare(`INSERT INTO config_bot (id) VALUES (1)`).run();
}

function getRaw() {
  ensureRow();
  return getDb().prepare('SELECT * FROM config_bot WHERE id = 1').get();
}

// Devuelve la config del bot con los JSON ya parseados.
function getConfig() {
  const row = getRaw();
  return {
    mensaje_bienvenida: row.mensaje_bienvenida,
    mensaje_fallback: row.mensaje_fallback,
    menu_definicion: safeParse(row.menu_definicion, {}),
    arbol_conversacion: safeParse(row.arbol_conversacion, {}),
    palabras_clave: safeParse(row.palabras_clave, []),
    activo: !!row.activo,
    modo_inicio: row.modo_inicio || 'bot',
  };
}

function getForFrontend() {
  const row = getRaw();
  return {
    mensaje_bienvenida: row.mensaje_bienvenida,
    mensaje_fallback: row.mensaje_fallback,
    menu_definicion: row.menu_definicion || '{}',
    arbol_conversacion: row.arbol_conversacion || '{}',
    palabras_clave: row.palabras_clave || '[]',
    activo: !!row.activo,
    modo_inicio: row.modo_inicio || 'bot',
  };
}

function save(fields) {
  ensureRow();
  const db = getDb();
  db.prepare(`
    UPDATE config_bot SET
      mensaje_bienvenida  = COALESCE(?, mensaje_bienvenida),
      mensaje_fallback    = COALESCE(?, mensaje_fallback),
      menu_definicion     = COALESCE(?, menu_definicion),
      arbol_conversacion  = COALESCE(?, arbol_conversacion),
      palabras_clave      = COALESCE(?, palabras_clave),
      activo              = COALESCE(?, activo),
      modo_inicio         = COALESCE(?, modo_inicio),
      updated_at          = datetime('now')
    WHERE id = 1
  `).run(
    fields.mensaje_bienvenida ?? null,
    fields.mensaje_fallback ?? null,
    fields.menu_definicion ?? null,
    fields.arbol_conversacion ?? null,
    fields.palabras_clave ?? null,
    fields.activo === undefined ? null : (fields.activo ? 1 : 0),
    fields.modo_inicio ?? null
  );
  return getForFrontend();
}

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

module.exports = { getRaw, getConfig, getForFrontend, save };
