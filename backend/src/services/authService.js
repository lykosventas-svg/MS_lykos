// ============================================================
//  Servicio: autenticacion (login, logout, perfil)
//  - login: genera session_id, invalida sesion anterior, expulsa socket viejo
//  - logout: limpia sesion en BD y desconecta socket
// ============================================================
const crypto = require('crypto');
const usuarioModel = require('../models/usuario');
const { signToken, invalidateSessionCache } = require('../middleware/auth');
const logger = require('../utils/logger');

function login(username, password, { ip, device } = {}) {
  const user = usuarioModel.findByUsername(username);
  if (!user) throw new Error('Usuario o contrasena incorrectos.');
  if (!usuarioModel.verifyPassword(password, user.password_hash)) {
    throw new Error('Usuario o contrasena incorrectos.');
  }
  // Generar nueva sesion (invalida cualquier sesion anterior en otro dispositivo).
  const sessionId = crypto.randomUUID();
  usuarioModel.setSession(user.id, sessionId, ip, device);
  invalidateSessionCache(user.id);
  user.session_id = sessionId;

  // Forzar desconexion del socket anterior en tiempo real.
  try {
    const sockets = require('../sockets');
    if (sockets.forceDisconnectUser) sockets.forceDisconnectUser(user.id);
  } catch (_) {}

  // Detener notificaciones recurrentes al iniciar sesion.
  try {
    const notifService = require('./notificacionService');
    notifService.detenerPorLogin(user.id);
  } catch (_) {}

  logger.info('Login exitoso', { usuario: user.username, ip: ip || null }, 'sistema', false);
  const token = signToken(user);
  return {
    token,
    user: { id: user.id, username: user.username, role: user.role, nombre: user.nombre },
  };
}

function logout(userId) {
  usuarioModel.clearSession(userId);
  invalidateSessionCache(userId);
  try {
    const sockets = require('../sockets');
    if (sockets.forceDisconnectUser) sockets.forceDisconnectUser(userId);
  } catch (_) {}
  logger.info('Logout', { usuario_id: userId }, 'sistema', false);
}

function profile(userId) {
  return usuarioModel.findById(userId);
}

module.exports = { login, logout, profile };
