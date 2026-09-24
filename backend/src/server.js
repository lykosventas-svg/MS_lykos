// ============================================================
//  LYKOS CHAT - Servidor principal
//  Express + Socket.io + SQLite + rutas por capas
// ============================================================
const path = require('path');
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const env = require('./config/env');
const { initDatabase } = require('./config/database');
const logger = require('./utils/logger');

// --- Inicializar BD ---
initDatabase();
logger.info(`BD inicializada en ${env.DB_PATH}`, null, 'sistema', false);
if (env.ENCRYPTION_KEY_EPHEMERAL) {
  logger.warn('ENCRYPTION_KEY no configurada: usando clave efimera. Las credenciales cifradas no sobreviviran a reinicios. Define ENCRYPTION_KEY en .env (64 hex chars).', null, 'sistema', false);
}

// --- Guards de produccion ---
if (env.NODE_ENV === 'production') {
  if (env.JWT_SECRET === 'lykos-dev-secret-cambiar') {
    throw new Error('JWT_SECRET inseguro en produccion. Define JWT_SECRET en .env.');
  }
  if (env.ADMIN_PASSWORD === 'admin123') {
    throw new Error('ADMIN_PASSWORD inseguro en produccion. Define ADMIN_PASSWORD en .env.');
  }
  if (env.ENCRYPTION_KEY_EPHEMERAL) {
    throw new Error('ENCRYPTION_KEY requerida en produccion. Define ENCRYPTION_KEY en .env (64 hex chars).');
  }
  logger.info('Guards de produccion OK.', null, 'sistema', false);
}

// --- App Express ---
const app = express();
app.set('trust proxy', 1); // Para que req.ip sea la IP real detras de Nginx
const server = http.createServer(app);

// --- Socket.io (mensajes instantaneos en panel de agentes) ---
const io = new Server(server, {
  cors: { origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',') },
  pingInterval: 25000,
  pingTimeout: 10000,
});
app.set('io', io);
const socketsModule = require('./sockets');
socketsModule.setup(io);

// --- Middlewares globales ---
// CSP: en produccion se habilita con directives especificas; en dev se deshabilita.
// Alpine.js requiere 'unsafe-eval' para evaluar expresiones en atributos (x-data, x-text, etc).
const helmetOpts = {};
if (env.NODE_ENV === 'production') {
  helmetOpts.contentSecurityPolicy = {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.tailwindcss.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  };
} else {
  helmetOpts.contentSecurityPolicy = false;
}
app.use(helmet(helmetOpts));

app.use(cors({ origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',') }));
app.use(morgan('tiny'));
// Captura el raw body para validacion de firma del webhook (X-Hub-Signature-256).
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// --- Rutas API ---
// Rate limiting global por IP (200 req/min).
const apiLimiter = rateLimit({
  windowMs: 60000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera un momento.' },
});
// Rate limiting por usuario (100 req/min). Decodifica JWT para obtener el ID.
const userLimiter = rateLimit({
  windowMs: 60000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.id) return 'u:' + decoded.id;
      } catch (_) {}
    }
    return req.ip;
  },
  message: { error: 'Demasiadas solicitudes. Espera un momento.' },
});
app.use('/api', apiLimiter, userLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/config', require('./routes/config'));
app.use('/api/conversaciones', require('./routes/conversaciones'));
app.use('/api/contactos', require('./routes/contactos'));
app.use('/api/metricas', require('./routes/metricas'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/ia-configs', require('./routes/iaConfigs'));
app.use('/api/mensajes-masivos', require('./routes/mensajesMasivos'));
app.use('/api/flujos-bot', require('./routes/flujosBot'));

// Webhook (Módulo 2 - ampliado despues). Por ahora GET verify + POST stub.
app.use('/webhook', require('./routes/webhook'));

// --- Frontend estatico ---
const publicDir = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicDir));
// SPA fallback: cualquier ruta no-API sirve index.html
app.get(/^\/(?!api|webhook).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// --- Manejo de errores ---
app.use((err, req, res, next) => {
  logger.error('Error no manejado', { message: err.message, path: req.path }, 'sistema');
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// --- Arrancar ---
server.listen(env.PORT, () => {
  logger.info(`Lykos Chat escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`, null, 'sistema', false);
  logger.info(`URL publica configurada: ${env.PUBLIC_URL}`, null, 'sistema', false);
  logger.info(`Webhook URL: ${env.PUBLIC_URL}/webhook`, null, 'sistema', false);

  // Checker de notificaciones recurrentes (cada 1 minuto)
  const notifService = require('./services/notificacionService');
  setInterval(() => {
    notifService.chequearRecurrencia().catch((e) => {
      logger.error('Error en checker de recurrencia', { message: e.message }, 'sistema', false);
    });
  }, 60000);
  logger.info('Checker de notificaciones recurrentes activo (cada 60s).', null, 'sistema', false);

  // Idle session cleanup: cierra sesiones inactivas por > SESSION_IDLE_TIMEOUT_MINUTES.
  if (env.SESSION_IDLE_TIMEOUT_MINUTES > 0) {
    const { getSessionCache } = require('./middleware/auth');
    const usuarioModel = require('./models/usuario');
    setInterval(() => {
      const now = Date.now();
      const limitMs = env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
      const cache = getSessionCache();
      for (const [userId, entry] of cache) {
        if (now - entry.lastActivity > limitMs) {
          usuarioModel.clearSession(userId);
          cache.delete(userId);
          logger.info('Sesion cerrada por inactividad', { userId }, 'sistema', false);
        }
      }
    }, 300000); // cada 5 minutos
    logger.info(`Idle timeout activo (${env.SESSION_IDLE_TIMEOUT_MINUTES} min).`, null, 'sistema', false);
  }
});

// --- Graceful shutdown ---
function shutdown(signal) {
  logger.info(`Senal ${signal} recibida. Cerrando servidor...`, null, 'sistema', false);
  socketsModule.stopSocketCleanup();
  server.close(() => {
    io.close(() => {
      logger.info('Servidor cerrado correctamente.', null, 'sistema', false);
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io };
