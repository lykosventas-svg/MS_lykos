-- ============================================================
--  Migracion 009:!Flujos de Bot (CRUD de modelos de bot)
--  Cada registro es un flujo de conversacion completo.
--  Solo un flujo puede estar activo a la vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS flujos_bot (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  activo          INTEGER DEFAULT 0,
  flujo_json      TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
