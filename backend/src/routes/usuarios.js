// ============================================================
//  Rutas: /api/usuarios (Módulo 6 - gestion de usuarios, admin only)
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const usuarioModel = require('../models/usuario');
const { validatePassword } = require('../utils/validators');

// GET /api/usuarios -> lista (admin only)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(usuarioModel.listAll());
});

// POST /api/usuarios -> crear (admin only)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role, nombre } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos.' });
  if (!['admin', 'agente'].includes(role || 'agente')) return res.status(400).json({ error: 'Rol invalido.' });
  const passCheck = validatePassword(password);
  if (!passCheck.valid) return res.status(400).json({ error: passCheck.error });
  try {
    const user = usuarioModel.create({ username, password, role, nombre });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ error: 'El usuario ya existe.' });
  }
});

// PUT /api/usuarios/:id/password -> cambiar contrasena (admin only)
router.put('/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Contrasena requerida.' });
  const passCheck = validatePassword(password);
  if (!passCheck.valid) return res.status(400).json({ error: passCheck.error });
  usuarioModel.updatePassword(req.params.id, password);
  res.json({ ok: true });
});

// PUT /api/usuarios/:id/activo -> activar/desactivar (admin only)
router.put('/:id/activo', requireAuth, requireAdmin, (req, res) => {
  const { activo } = req.body;
  // No permitir desactivar al ultimo admin.
  if (!activo) {
    const u = usuarioModel.findById(req.params.id);
    if (u && u.role === 'admin' && usuarioModel.countAdmins() <= 1) {
      return res.status(400).json({ error: 'No se puede desactivar al ultimo administrador.' });
    }
  }
  usuarioModel.setActivo(req.params.id, activo);
  res.json({ ok: true });
});

// PUT /api/usuarios/:id -> modificar usuario (admin only)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { username, nombre, role } = req.body;
  if (role && !['admin', 'agente'].includes(role)) return res.status(400).json({ error: 'Rol invalido.' });
  // No permitir quitar el rol admin al ultimo admin.
  if (role && role !== 'admin') {
    const u = usuarioModel.findById(req.params.id);
    if (u && u.role === 'admin' && usuarioModel.countAdmins() <= 1) {
      return res.status(400).json({ error: 'No se puede cambiar el rol del ultimo administrador.' });
    }
  }
  try {
    const user = usuarioModel.update(req.params.id, { username, nombre, role });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ error: 'Nombre de usuario ya en uso.' });
  }
});

// DELETE /api/usuarios/:id -> eliminar usuario (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  // No permitir autoeliminarse.
  if (parseInt(req.params.id, 10) === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  }
  const ok = usuarioModel.remove(req.params.id);
  if (!ok) return res.status(400).json({ error: 'No se puede eliminar: es el ultimo administrador o no existe.' });
  res.json({ ok: true });
});

module.exports = router;
