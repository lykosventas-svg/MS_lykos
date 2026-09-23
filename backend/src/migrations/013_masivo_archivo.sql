-- ============================================================
--  Migracion 013: archivo_adjunto en mensajes_masivos
--  Almacena JSON con info del archivo adjunto {filename, url, name, mimetype}
-- ============================================================

ALTER TABLE mensajes_masivos ADD COLUMN archivo_adjunto TEXT;
