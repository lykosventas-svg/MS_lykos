-- ============================================================
--  LYKOS CHAT - Esquema de base de datos (SQLite)
--  Migrable a PostgreSQL cambiando tipos sintacticos menores.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------
--  CONFIG_WHATSAPP: credenciales de la WhatsApp Cloud API
--  (token cifrado AES-256-GCM en la columna access_token_enc)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_whatsapp (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  phone_number_id      TEXT,
  waba_id              TEXT,
  access_token_enc     TEXT,                          -- token cifrado (iv:authTag:ciphertext)
  graph_api_version    TEXT DEFAULT 'v19.0',
  verify_token         TEXT,                          -- token de verificacion del webhook
  public_url           TEXT,                          -- URL publica del sistema
  webhook_verified     INTEGER DEFAULT 0,            -- 0/1
  token_valid          INTEGER DEFAULT 0,            -- 0/1
  token_expires_at     TEXT,                          -- fecha estimada de expiracion
  last_check_at        TEXT,
  last_check_result    TEXT,                          -- resultado legible de la ultima prueba
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  CONFIG_IA: configuracion de inteligencia artificial (opcional)
--  api_key cifrada AES-256-GCM en api_key_enc
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_ia (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  ia_enabled           INTEGER DEFAULT 0,            -- 0=OFF, 1=ON
  ia_mode              TEXT DEFAULT 'respaldo',      -- 'respaldo' | 'principal'
  base_url             TEXT,                          -- ej: https://api-ap-southeast-1.modelarts-maas.com/openai/v1
  api_key_enc          TEXT,                          -- API key cifrada
  model_name           TEXT DEFAULT 'glm-5.2',
  temperature          REAL DEFAULT 0.4,
  max_tokens           INTEGER DEFAULT 300,
  system_prompt        TEXT,                          -- contexto del negocio (editable por admin)
  max_messages_per_day INTEGER DEFAULT 50,           -- limite de seguridad por conversacion/dia
  last_check_at        TEXT,
  last_check_result    TEXT,                          -- resultado legible de la ultima prueba IA
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  CONFIG_BOT: flujos/menus del modo BOT (sin IA)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_bot (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  mensaje_bienvenida   TEXT DEFAULT 'Hola! Bienvenido. Como podemos ayudarte?',
  mensaje_fallback     TEXT DEFAULT 'No entendi lo que dijiste. Elige una opcion o escribe "asesor" para hablar con un humano.',
  menu_definicion      TEXT DEFAULT '{}',            -- JSON: menus con botones interactivos
  arbol_conversacion   TEXT DEFAULT '{}',            -- JSON: arbol de 2 niveles
  palabras_clave       TEXT DEFAULT '[]',            -- JSON: [{palabra, respuesta}]
  activo               INTEGER DEFAULT 1,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  USUARIOS: admin y agentes (auth JWT)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'agente' CHECK (role IN ('admin','agente')),
  nombre        TEXT,
  activo        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  CONTACTOS: personas que escriben por WhatsApp
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contactos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id       TEXT UNIQUE NOT NULL,                   -- numero en formato internacional sin +
  nombre      TEXT,                                   -- nombre push de WhatsApp
  etiquetas   TEXT DEFAULT '[]',                      -- JSON array de strings
  notas       TEXT,                                   -- notas internas del agente
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  CONVERSACIONES: una por contacto
--  modo: 'bot' | 'ia' | 'humano'
--  estado: 'activa' | 'cerrada' | 'pendiente'
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversaciones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  contacto_id       INTEGER NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  modo              TEXT DEFAULT 'bot' CHECK (modo IN ('bot','ia','humano')),
  estado            TEXT DEFAULT 'activa' CHECK (estado IN ('activa','cerrada','pendiente')),
  agente_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  paso_flujo        TEXT,                             -- paso actual del flujo del bot
  datos_sesion      TEXT DEFAULT '{}',               -- JSON: variables de sesion del flujo
  mensajes_ia_hoy   INTEGER DEFAULT 0,               -- contador de mensajes IA hoy
  contador_ia_fecha TEXT,                             -- fecha (YYYY-MM-DD) del contador
  ventana_24h_hasta TEXT,                             -- timestamp limite ventana 24h
  ultima_actividad  TEXT DEFAULT (datetime('now')),
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_contacto ON conversaciones(contacto_id);
CREATE INDEX IF NOT EXISTS idx_conv_agente ON conversaciones(agente_id);
CREATE INDEX IF NOT EXISTS idx_conv_estado ON conversaciones(estado);

-- ----------------------------------------------------------
--  MENSAJES: historial de cada conversacion
--  direccion: 'in' (recibido) | 'out' (enviado)
--  tipo: 'text' | 'interactive' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'template' | 'button'
--  origen: 'bot' | 'ia' | 'humano' | 'webhook' | 'sistema'
--  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  contacto_id     INTEGER NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  wam_id          TEXT,                               -- message id de WhatsApp (para dedupe y status)
  direccion       TEXT NOT NULL CHECK (direccion IN ('in','out')),
  tipo            TEXT NOT NULL DEFAULT 'text',
  contenido       TEXT NOT NULL DEFAULT '{}',         -- JSON: {text, caption, url, lat, lng, ...}
  origen          TEXT DEFAULT 'webhook',
  status          TEXT DEFAULT 'pending',
  error           TEXT,
  timestamp       TEXT DEFAULT (datetime('now')),
  UNIQUE(wam_id)                                   -- deduplicacion por message id de Meta
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON mensajes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_msg_contacto ON mensajes(contacto_id);
CREATE INDEX IF NOT EXISTS idx_msg_ts ON mensajes(timestamp);

-- ----------------------------------------------------------
--  USO_IA: registro de consumo de la IA (tokens, costos)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS uso_ia (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER REFERENCES conversaciones(id) ON DELETE SET NULL,
  contacto_id     INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  fecha           TEXT DEFAULT (datetime('now')),
  prompt_tokens   INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  modelo          TEXT,
  estado          TEXT DEFAULT 'ok',                  -- 'ok' | 'error'
  error           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uso_fecha ON uso_ia(fecha);

-- ----------------------------------------------------------
--  EVENTOS_PROCESADOS: deduplicacion de eventos del webhook
--  (Meta puede reenviar el mismo evento)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_procesados (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT UNIQUE NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
--  LOGS_API: errores de APIs (Meta e IA) para el panel
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs_api (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  origen      TEXT NOT NULL,                          -- 'whatsapp' | 'ia' | 'sistema'
  nivel       TEXT DEFAULT 'error',                   -- 'info' | 'warn' | 'error'
  mensaje     TEXT,
  detalle     TEXT,                                   -- JSON con contexto
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs_api(created_at);
