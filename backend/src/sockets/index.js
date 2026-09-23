// ============================================================
//  Socket.io: conexion, eventos y acceso global a la instancia
//  Los servicios usan getIo() para emitir eventos en tiempo real.
//  - Map<userId, socket> para sesion unica por usuario
//  - forceDisconnectUser expulsa la conexion anterior
//  - Cleanup periódico de sockets stale cada 5 minutos
// ============================================================
let ioInstance = null;
const activeSockets = new Map();
let cleanupInterval = null;

// Devuelve la instancia de io (o null si no esta lista).
function getIo() { return ioInstance; }

// Fuerza la desconexion de un usuario (emit force_logout antes de desconectar).
function forceDisconnectUser(userId) {
  const oldSocket = activeSockets.get(userId);
  if (oldSocket) {
    try {
      const logger = require('../utils/logger');
      logger.info('Socket expulsado por nueva sesión', { userId }, 'sistema', false);
    } catch (_) {}
    oldSocket.emit('force_logout', { message: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.' });
    oldSocket.disconnect(true);
    activeSockets.delete(userId);
  }
}

function setup(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const env = require('../config/env');
        const usuarioModel = require('../models/usuario');
        const payload = jwt.verify(token, env.JWT_SECRET);

        // Validar que la sesion del JWT siga activa en BD.
        const currentSessionId = usuarioModel.getSessionId(payload.id);
        if (!currentSessionId || currentSessionId !== payload.session_id) {
          socket.emit('force_logout', { message: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.' });
          socket.disconnect(true);
          return;
        }

        socket.data.user = payload;
        socket.join('agentes');

        // Sesion unica: si el usuario ya tenia un socket, expulsar el anterior.
        const userId = payload.id;
        const oldSocket = activeSockets.get(userId);
        if (oldSocket && oldSocket.id !== socket.id) {
          oldSocket.emit('force_logout', { message: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.' });
          oldSocket.disconnect(true);
        }
        activeSockets.set(userId, socket);
      } catch (_) {
        // Token invalido: no se une a la sala ni se registra.
      }
    }

    socket.on('disconnect', () => {
      const userId = socket.data.user?.id;
      if (userId && activeSockets.get(userId)?.id === socket.id) {
        activeSockets.delete(userId);
      }
    });
  });

  // Cleanup periódico: elimina entradas de sockets que ya no estan conectados.
  cleanupInterval = setInterval(() => {
    for (const [userId, socket] of activeSockets) {
      if (!socket.connected) {
        activeSockets.delete(userId);
      }
    }
  }, 300000); // 5 minutos
}

function stopSocketCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = { setup, getIo, forceDisconnectUser, stopSocketCleanup };
