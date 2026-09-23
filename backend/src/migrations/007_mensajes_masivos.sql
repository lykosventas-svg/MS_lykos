-- ============================================================
--  Migracion 007: Mensajes masivos (envio en volumen)
-- ============================================================

CREATE TABLE IF NOT EXISTS mensajes_masivos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  mensaje         TEXT NOT NULL,
  contactos_json  TEXT,
  enviar_a_todos  INTEGER DEFAULT 0,
  estado          TEXT DEFAULT 'pendiente',
  enviados        INTEGER DEFAULT 0,
  fallidos        INTEGER DEFAULT 0,
  total           INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
