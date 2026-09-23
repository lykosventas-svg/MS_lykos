-- ============================================================
--  Migracion 003: Modulo de Notificaciones
--  Notifica a empleados por WhatsApp personal o email cuando
--  llega un nuevo mensaje al numero del negocio.
--  Incluye notificaciones recurrentes que se detienen al
--  iniciar sesion en el software.
-- ============================================================

-- Configuracion global de notificaciones (singleton)
CREATE TABLE IF NOT EXISTS config_notificaciones (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  url_software         TEXT,
  mensaje_default      TEXT DEFAULT 'Tienes un nuevo mensaje en Lykos Chat. Ingresa a {url} para atenderlo.',
  smtp_host            TEXT,
  smtp_port            INTEGER DEFAULT 587,
  smtp_user            TEXT,
  smtp_pass_enc        TEXT,
  smtp_from            TEXT,
  smtp_activado        INTEGER DEFAULT 0,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- Configuracion de notificaciones por usuario
CREATE TABLE IF NOT EXISTS notificaciones_config (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id           INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  activado             INTEGER DEFAULT 0,
  email                TEXT,
  whatsapp_personal    TEXT,
  mensaje_personalizado TEXT,
  recurrencia_activada INTEGER DEFAULT 0,
  recurrencia_minutos  INTEGER DEFAULT 5,
  ultimo_envio         TEXT,
  recurrencia_detenida INTEGER DEFAULT 0,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id)
);

-- Log de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notificaciones_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  via             TEXT NOT NULL,
  destino         TEXT,
  mensaje         TEXT,
  estado          TEXT DEFAULT 'ok',
  error           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
