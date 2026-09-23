-- ============================================================
--  Migracion 008: Anadir template_name y language a mensajes_masivos
-- ============================================================

ALTER TABLE mensajes_masivos ADD COLUMN template_name TEXT;
ALTER TABLE mensajes_masivos ADD COLUMN language TEXT DEFAULT 'es_MX';
