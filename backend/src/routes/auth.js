// ============================================================
//  Rutas: /api/auth (login, logout, perfil)
// ============================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const env = require('../config/env');

// Rate limiting en login para evitar fuerza bruta.
const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espera unos minutos.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos.' });
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || null;
  const device = req.headers['user-agent'] || null;
  try {
    const result = authService.login(username, password, { ip, device });
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  try {
    authService.logout(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al cerrar sesion.' });
  }
});

router.get('/profile', requireAuth, (req, res) => {
  const user = authService.profile(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(user);
});

module.exports = router;
