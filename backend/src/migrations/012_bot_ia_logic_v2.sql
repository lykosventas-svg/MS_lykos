-- ============================================================
--  Migracion 012: Nueva logica de interaccion Bot/IA/Humano
--  - bot_completado: marca si el flujo del bot ya termino
--    (impide que el bot se reactive para este chat)
-- ============================================================

ALTER TABLE conversaciones ADD COLUMN bot_completado INTEGER DEFAULT 0;
