-- ============================================================
--  Migracion 010: Soft delete en contactos
--  Permite "eliminar" un contacto sin borrar sus conversaciones.
--  Las conversaciones siguen visibles en Agentes con indicador visual.
-- ============================================================

ALTER TABLE contactos ADD COLUMN deleted INTEGER DEFAULT 0;
