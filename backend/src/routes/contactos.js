// ============================================================
//  Rutas: /api/contactos (Módulo 6 - CRUD de contactos)
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const contactoModel = require('../models/contacto');

// GET /api/contactos?search=
router.get('/', requireAuth, (req, res) => {
  const { search } = req.query;
  const lista = contactoModel.listAll({ search }).map(c => ({
    ...c,
    etiquetas: (() => { try { return JSON.parse(c.etiquetas || '[]'); } catch (_) { return []; } })(),
  }));
  res.json(lista);
});

// GET /api/contactos/:id
router.get('/:id', requireAuth, (req, res) => {
  const c = contactoModel.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contacto no encontrado.' });
  res.json({ ...c, etiquetas: (() => { try { return JSON.parse(c.etiquetas || '[]'); } catch (_) { return []; } })() });
});

// PUT /api/contactos/:id -> actualizar nombre, etiquetas y notas
router.put('/:id', requireAuth, (req, res) => {
  const { nombre, etiquetas, notas } = req.body;
  let result = contactoModel.findById(req.params.id);
  if (!result) return res.status(404).json({ error: 'Contacto no encontrado.' });
  if (nombre !== undefined) result = contactoModel.updateName(req.params.id, nombre);
  if (etiquetas !== undefined) result = contactoModel.updateTags(req.params.id, etiquetas);
  if (notas !== undefined) result = contactoModel.updateNotas(req.params.id, notas);
  res.json({ ok: true, contacto: { ...result, etiquetas: (() => { try { return JSON.parse(result.etiquetas || '[]'); } catch (_) { return []; } })() } });
});

// DELETE /api/contactos/:id -> soft delete (marca como eliminado, no borra conversaciones)
router.delete('/:id', requireAuth, (req, res) => {
  const c = contactoModel.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contacto no encontrado.' });
  contactoModel.softDelete(req.params.id);
  res.json({ ok: true });
});

// POST /api/contactos/:id/restore -> restaurar contacto eliminado
router.post('/:id/restore', requireAuth, (req, res) => {
  const c = contactoModel.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contacto no encontrado.' });
  contactoModel.restore(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
