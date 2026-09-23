-- ============================================================
--  Migracion 004: CRUD de configuraciones de IA
--  Permite tener multiples configs de IA y activar solo una.
-- ============================================================

CREATE TABLE IF NOT EXISTS config_ia_configs (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre               TEXT NOT NULL DEFAULT 'IA 1',
  activo               INTEGER DEFAULT 0,
  ia_mode              TEXT DEFAULT 'respaldo',
  base_url             TEXT,
  api_key_enc          TEXT,
  model_name           TEXT DEFAULT 'glm-5.2',
  temperature          REAL DEFAULT 0.4,
  max_tokens           INTEGER DEFAULT 300,
  system_prompt        TEXT,
  max_messages_per_day INTEGER DEFAULT 50,
  last_check_at        TEXT,
  last_check_result    TEXT,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);
