// ============================================================
//  Rutas: /api/ia-configs (CRUD de configuraciones de IA)
//  Admin only. Solo una config puede estar activa a la vez.
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const iaConfigModel = require('../models/configIaConfigModel');
const iaService = require('../services/iaService');

// GET /api/ia-configs -> listar todas
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(iaConfigModel.listForFrontend());
});

// POST /api/ia-configs -> crear
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = iaConfigModel.create({
    nombre: f.nombre, descripcion: f.descripcion, activo: f.activo, ia_mode: f.ia_mode,
    base_url: f.base_url, api_key: f.api_key, model_name: f.model_name,
    temperature: f.temperature, max_tokens: f.max_tokens,
    system_prompt: f.system_prompt, max_messages_per_day: f.max_messages_per_day,
  });
  res.json({ ok: true, config });
});

// PUT /api/ia-configs/deactivate-all -> desactivar todas (antes de /:id para evitar conflicto)
router.put('/deactivate-all', requireAuth, requireAdmin, (req, res) => {
  const db = require('../config/database').getDb();
  db.prepare('UPDATE config_ia_configs SET activo = 0').run();
  res.json({ ok: true });
});

// PUT /api/ia-configs/:id -> actualizar
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = iaConfigModel.update(req.params.id, {
    nombre: f.nombre, descripcion: f.descripcion, activo: f.activo, ia_mode: f.ia_mode,
    base_url: f.base_url, api_key: f.api_key, model_name: f.model_name,
    temperature: f.temperature, max_tokens: f.max_tokens,
    system_prompt: f.system_prompt, max_messages_per_day: f.max_messages_per_day,
  });
  res.json({ ok: true, config });
});

// DELETE /api/ia-configs/:id -> eliminar
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  iaConfigModel.remove(req.params.id);
  res.json({ ok: true });
});

// PUT /api/ia-configs/:id/activate -> activar (desactiva las demas)
router.put('/:id/activate', requireAuth, requireAdmin, (req, res) => {
  iaConfigModel.activate(req.params.id);
  res.json({ ok: true });
});

// POST /api/ia-configs/:id/test -> probar conexion
router.post('/:id/test', requireAuth, requireAdmin, async (req, res) => {
  const result = await iaService.testConnectionById(req.params.id);
  res.json(result);
});

module.exports = router;
