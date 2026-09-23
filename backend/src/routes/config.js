// ============================================================
//  Rutas: /api/config (panel de configuracion - Módulo 1)
//  Pestaña WhatsApp + Pestaña IA + Pestaña BOT (flujos)
//  Solo admin puede escribir; agentes pueden leer.
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');

const configWaModel = require('../models/configWhatsApp');
const configIaModel = require('../models/configIA');
const configBotModel = require('../models/configBot');

const whatsappService = require('../services/whatsappService');
const iaService = require('../services/iaService');

// ---------- WHATSAPP ----------

// GET /api/config/whatsapp
router.get('/whatsapp', requireAuth, (req, res) => {
  res.json(configWaModel.getForFrontend());
});

// PUT /api/config/whatsapp  (guardar credenciales)
router.put('/whatsapp', requireAuth, requireAdmin, (req, res) => {
  const { phone_number_id, waba_id, access_token, app_secret, graph_api_version, verify_token, public_url } = req.body || {};
  const result = configWaModel.save({ phone_number_id, waba_id, access_token, app_secret, graph_api_version, verify_token, public_url });
  res.json({ ok: true, config: result });
});

// POST /api/config/whatsapp/test  (probar conexion)
router.post('/whatsapp/test', requireAuth, requireAdmin, async (req, res) => {
  const result = await whatsappService.testConnection();
  res.json(result);
});

// POST /api/config/whatsapp/regenerate-verify-token  (autogenerar verify token)
router.post('/whatsapp/regenerate-verify-token', requireAuth, requireAdmin, (req, res) => {
  const crypto = require('crypto');
  const newToken = crypto.randomBytes(16).toString('hex');
  configWaModel.save({ verify_token: newToken });
  res.json({ ok: true, verify_token: newToken });
});

// ---------- IA (opcional) ----------

// GET /api/config/ia
router.get('/ia', requireAuth, (req, res) => {
  res.json(configIaModel.getForFrontend());
});

// PUT /api/config/ia  (guardar config IA)
router.put('/ia', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  if (f.ia_mode && !['respaldo', 'principal'].includes(f.ia_mode)) {
    return res.status(400).json({ error: 'Modo IA invalido. Debe ser "respaldo" o "principal".' });
  }
  if (f.temperature != null && (f.temperature < 0 || f.temperature > 2)) {
    return res.status(400).json({ error: 'Temperature debe estar entre 0 y 2.' });
  }
  if (f.max_tokens != null && (!Number.isInteger(f.max_tokens) || f.max_tokens < 1)) {
    return res.status(400).json({ error: 'Max tokens debe ser un entero positivo.' });
  }
  const result = configIaModel.save({
    ia_enabled: f.ia_enabled,
    ia_mode: f.ia_mode,
    base_url: f.base_url,
    api_key: f.api_key,
    model_name: f.model_name,
    temperature: f.temperature,
    max_tokens: f.max_tokens,
    system_prompt: f.system_prompt,
    max_messages_per_day: f.max_messages_per_day,
  });
  res.json({ ok: true, config: result });
});

// POST /api/config/ia/test  (probar conexion IA)
router.post('/ia/test', requireAuth, requireAdmin, async (req, res) => {
  const result = await iaService.testConnection();
  res.json(result);
});

// ---------- BOT (flujos) ----------

// GET /api/config/bot
router.get('/bot', requireAuth, (req, res) => {
  res.json(configBotModel.getForFrontend());
});

// PUT /api/config/bot  (guardar flujos del bot)
router.put('/bot', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const result = configBotModel.save({
    mensaje_bienvenida: f.mensaje_bienvenida,
    mensaje_fallback: f.mensaje_fallback,
    menu_definicion: f.menu_definicion,
    arbol_conversacion: f.arbol_conversacion,
    palabras_clave: f.palabras_clave,
    activo: f.activo,
    modo_inicio: f.modo_inicio,
  });
  res.json({ ok: true, config: result });
});

module.exports = router;
