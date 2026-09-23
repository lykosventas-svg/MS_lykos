// ============================================================
//  Rutas: /webhook (Módulo 2 - WhatsApp Cloud API)
//  GET  -> verificacion de Meta (hub.challenge + verify token)
//  POST -> recepcion de mensajes:
//           1. Validar firma X-Hub-Signature-256
//           2. Responder 200 inmediatamente
//           3. Procesar en segundo plano (parseo, dedupe, storage, orquestador)
// ============================================================
const express = require('express');
const router = express.Router();
const configWaModel = require('../models/configWhatsApp');
const webhookService = require('../services/webhookService');
const logger = require('../utils/logger');

// --- GET /webhook: verificacion del webhook de Meta ---
// Meta envia: hub.mode=subscribe, hub.verify_token, hub.challenge
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const cfg = configWaModel.getRaw();
  const expectedToken = cfg.verify_token;

  if (mode === 'subscribe' && token && token === expectedToken) {
    configWaModel.setWebhookVerified(true);
    logger.info('Webhook verificado por Meta.', null, 'whatsapp', false);
    return res.status(200).send(challenge);
  }
  logger.warn('Webhook: verificacion fallida (verify token incorrecto).', null, 'whatsapp', false);
  return res.sendStatus(403);
});

// --- POST /webhook: recepcion de eventos ---
router.post('/', (req, res) => {
  const cfg = configWaModel.getRaw();
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody || '';

  // 1. Validar firma si el App Secret esta configurado.
  if (cfg.app_secret) {
    if (!webhookService.verifySignature(rawBody, signature, cfg.app_secret)) {
      logger.error('Webhook: firma X-Hub-Signature-256 invalida. Peticion rechazada.', null, 'whatsapp');
      return res.sendStatus(403);
    }
  } else {
    // Sin App Secret: advertir (en desarrollo se puede omitir, en produccion NO).
    logger.warn('Webhook: App Secret no configurado, firma no validada. Configuralo en el panel para seguridad.', null, 'whatsapp', false);
  }

  // 2. Responder 200 inmediatamente a Meta (requisito obligatorio).
  res.sendStatus(200);

  // 3. Procesar en segundo plano (no bloquea la respuesta).
  setImmediate(() => {
    webhookService.processIncoming(req.body).catch((err) => {
      logger.error('Webhook: error procesando evento', { message: err.message }, 'whatsapp');
    });
  });
});

module.exports = router;
