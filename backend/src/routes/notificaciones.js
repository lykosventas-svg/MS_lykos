// ============================================================
//  Rutas: /api/notificaciones (admin only)
//  Config global + config por usuario + log
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const notifModel = require('../models/notificacionModel');

// --- GET /api/notificaciones/enterado/:usuarioId -> detener recurrencia (link email) ---
router.get('/enterado/:usuarioId', (req, res) => {
  try {
    notifModel.detenerRecurrencia(parseInt(req.params.usuarioId, 10));
    notifModel.logEnvio({ usuario_id: parseInt(req.params.usuarioId, 10), via: 'email', destino: 'enterado', mensaje: 'Notificaciones detenidas por boton Enterado', estado: 'ok' });
  } catch (_) {}
  // Pagina de confirmacion simple.
  res.type('text/html').send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa"><div style="text-align:center;background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)"><h1 style="color:#0a1f3d;font-size:24px">Notificaciones detenidas</h1><p style="color:#64748b;margin-top:12px">Has sido dado de enterado. No recibiras mas notificaciones recurrentes.</p><p style="color:#94a3b8;margin-top:20px;font-size:13px">Cuando llegue un nuevo mensaje, las notificaciones se reactivaran automaticamente.</p></div></body></html>');
});

// --- GET /api/notificaciones/global -> config global ---
router.get('/global', requireAuth, requireAdmin, (req, res) => {
  res.json(notifModel.getGlobalFrontend());
});

// --- PUT /api/notificaciones/global -> guardar config global ---
router.put('/global', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const result = notifModel.saveGlobal({
    url_software: f.url_software,
    mensaje_default: f.mensaje_default,
    smtp_host: f.smtp_host,
    smtp_port: f.smtp_port,
    smtp_user: f.smtp_user,
    smtp_pass: f.smtp_pass,
    smtp_from: f.smtp_from,
    smtp_activado: f.smtp_activado,
  });
  res.json({ ok: true, config: result });
});

// --- GET /api/notificaciones/usuarios -> lista config por usuario ---
router.get('/usuarios', requireAuth, requireAdmin, (req, res) => {
  res.json(notifModel.listAll());
});

// --- PUT /api/notificaciones/usuarios/:id -> guardar config de un usuario ---
router.put('/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const result = notifModel.saveUsuario(req.params.id, {
    activado: f.activado,
    email: f.email,
    whatsapp_personal: f.whatsapp_personal,
    mensaje_personalizado: f.mensaje_personalizado,
    recurrencia_activada: f.recurrencia_activada,
    recurrencia_minutos: f.recurrencia_minutos,
  });
  res.json({ ok: true, config: result });
});

// --- GET /api/notificaciones/log -> historial de envios ---
router.get('/log', requireAuth, requireAdmin, (req, res) => {
  res.json(notifModel.listLog(50));
});

module.exports = router;
