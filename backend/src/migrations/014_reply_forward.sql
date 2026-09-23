-- ============================================================
--  Migracion 014: Reply y Forward de mensajes
--  - reply_to: ID del mensaje que se cita al responder
--  - forwarded_from: ID del mensaje original que fue reenviado
--  - forwarded: flag 0/1 para mostrar etiqueta "Reenviado"
-- ============================================================

ALTER TABLE mensajes ADD COLUMN reply_to INTEGER REFERENCES mensajes(id) ON DELETE SET NULL;
ALTER TABLE mensajes ADD COLUMN forwarded_from INTEGER REFERENCES mensajes(id) ON DELETE SET NULL;
ALTER TABLE mensajes ADD COLUMN forwarded INTEGER DEFAULT 0;
