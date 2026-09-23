// ============================================================
//  Middleware: autenticacion JWT y control de roles
//  - signToken incluye session_id en el payload
//  - requireAuth valida sesion activa con cache en memoria (TTL 5s)
//  - Refresh token: si el JWT esta al <30% de su vida, se renueva via header
//  - Idle tracking: actualiza lastActivity en cache (sin write a BD)
// ============================================================
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const usuarioModel = require('../models/usuario');
const logger = require('../utils/logger');

// --- Cache de sesion en memoria ---
// Estructura: userId -> { sessionId, lastActivity, cacheExpires }
const sessionCache = new Map();
const CACHE_TTL_MS = 5000; // 5 segundos

function getCachedSession(userId) {
  const entry = sessionCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.cacheExpires) {
    sessionCache.delete(userId);
    return null;
  }
  return entry;
}

function setCachedSession(userId, sessionId) {
  sessionCache.set(userId, {
    sessionId,
    lastActivity: Date.now(),
    cacheExpires: Date.now() + CACHE_TTL_MS,
  });
}

function invalidateSessionCache(userId) {
  sessionCache.delete(userId);
}

// Devuelve el cache para que server.js pueda hacer el cleanup de idle timeout.
function getSessionCache() {
  return sessionCache;
}

// Genera un JWT para un usuario (incluye session_id).
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, session_id: user.session_id },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

// Middleware que requiere un JWT valido y sesion activa. Carga req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado.' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    // Validar sesion: cache primero, BD si miss.
    let cached = getCachedSession(payload.id);
    let currentSessionId;
    if (cached) {
      currentSessionId = cached.sessionId;
    } else {
      currentSessionId = usuarioModel.getSessionId(payload.id);
      if (currentSessionId) setCachedSession(payload.id, currentSessionId);
    }

    if (!currentSessionId || currentSessionId !== payload.session_id) {
      logger.warn('Sesión reemplazada (API)', { userId: payload.id, ip: req.ip }, 'sistema', false);
      invalidateSessionCache(payload.id);
      return res.status(401).json({ error: 'Sesión cerrada por inicio de sesión en otro dispositivo.', code: 'SESSION_REPLACED' });
    }

    // Actualizar lastActivity en cache (sin write a BD).
    const entry = sessionCache.get(payload.id);
    if (entry) entry.lastActivity = Date.now();

    req.user = payload;

    // Refresh token: si queda <30% de vida, renovar via header.
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp && decoded.iat) {
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = decoded.exp - now;
      const totalLifetime = decoded.exp - decoded.iat;
      if (timeLeft < totalLifetime * 0.3) {
        const newToken = jwt.sign(
          { id: payload.id, username: payload.username, role: payload.role, session_id: payload.session_id },
          env.JWT_SECRET,
          { expiresIn: env.JWT_EXPIRES_IN }
        );
        res.setHeader('X-New-Token', newToken);
      }
    }

    next();
  } catch (_) {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

// Middleware que requiere rol admin.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permisos insuficientes (requiere admin).' });
  }
  next();
}

module.exports = { signToken, requireAuth, requireAdmin, invalidateSessionCache, getSessionCache };
