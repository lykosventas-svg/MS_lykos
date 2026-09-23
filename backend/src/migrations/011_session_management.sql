-- ============================================================
--  Migracion 011: Gestion de sesiones (sesion unica por usuario)
--  - session_id: UUID de la sesion activa (null = sin sesion)
--  - session_ip: IP del dispositivo que inicio sesion
--  - session_device: User-Agent del dispositivo
--  - session_started_at: timestamp del inicio de sesion
--  Un nuevo login sobrescribe session_id, invalidando el JWT anterior.
-- ============================================================

ALTER TABLE usuarios ADD COLUMN session_id TEXT;
ALTER TABLE usuarios ADD COLUMN session_ip TEXT;
ALTER TABLE usuarios ADD COLUMN session_device TEXT;
ALTER TABLE usuarios ADD COLUMN session_started_at TEXT;
