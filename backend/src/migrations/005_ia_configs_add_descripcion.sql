-- ============================================================
--  Migracion 005: Anadir columna descripcion a config_ia_configs
-- ============================================================

ALTER TABLE config_ia_configs ADD COLUMN descripcion TEXT;
