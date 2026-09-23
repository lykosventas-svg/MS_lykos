// ============================================================
//  Rutas: /api/flujos-bot (CRUD + activar + upload documentos)
//  Admin only. Solo un flujo puede estar activo a la vez.
// ============================================================
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const flujoBotModel = require('../models/flujoBot');
const logger = require('../utils/logger');

// GET /api/flujos-bot -> listar todos
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(flujoBotModel.listForFrontend());
});

// POST /api/flujos-bot -> crear
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = flujoBotModel.create({
    nombre: f.nombre,
    descripcion: f.descripcion,
    activo: f.activo,
    flujo: f.flujo,
  });
  res.json({ ok: true, config });
});

// PUT /api/flujos-bot/deactivate-all -> desactivar todos (antes de /:id)
router.put('/deactivate-all', requireAuth, requireAdmin, (req, res) => {
  flujoBotModel.deactivateAll();
  res.json({ ok: true });
});

// POST /api/flujos-bot/upload-doc -> subir documento (antes de /:id)
router.post('/upload-doc', requireAuth, requireAdmin, (req, res) => {
  const { filename, base64, mimetype } = req.body || {};
  if (!filename || !base64) return res.status(400).json({ error: 'Faltan datos del archivo.' });

  const ext = path.extname(filename).toLowerCase();
  if (!['.pdf', '.docx'].includes(ext)) {
    return res.status(400).json({ error: 'Solo se permiten archivos .pdf y .docx' });
  }

  try {
    const uploadsDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const uniqueName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadsDir, uniqueName);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    logger.info(`Documento subido: ${uniqueName} (${(buffer.length / 1024).toFixed(1)}KB)`, null, 'sistema', false);
    res.json({ ok: true, filename: uniqueName, url: '/uploads/' + uniqueName, mimetype: mimetype || ext });
  } catch (e) {
    logger.error('Error al subir documento', { message: e.message }, 'sistema');
    res.status(500).json({ error: 'No se pudo guardar el archivo.' });
  }
});

// PUT /api/flujos-bot/:id -> actualizar
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = flujoBotModel.update(req.params.id, {
    nombre: f.nombre,
    descripcion: f.descripcion,
    activo: f.activo,
    flujo: f.flujo,
  });
  res.json({ ok: true, config });
});

// DELETE /api/flujos-bot/:id -> eliminar5eliminar
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  flujoBotModel.remove(req.params.id);
  res.json({ ok: true });
});

// PUT /api/flujos-bot/:id/activate -> activar (desactiva las demas)
router.put('/:id/activate', requireAuth, requireAdmin, (req, res) => {
  flujoBotModel.activate(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
