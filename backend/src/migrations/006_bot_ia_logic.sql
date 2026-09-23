-- ============================================================
--  Migracion 006: Cambios de logica BOT/IA
--  - handoff_ocurrido: marca si la conversacion paso a humano
--    (impide volver a modo bot despues)
--  - modo_inicio: define como empiezan las nuevas conversaciones
--    ('bot' o 'ia')
-- ============================================================

ALTER TABLE conversaciones ADD COLUMN handoff_ocurrido INTEGER DEFAULT 0;
ALTER TABLE config_bot ADD COLUMN modo_inicio TEXT DEFAULT 'bot';
