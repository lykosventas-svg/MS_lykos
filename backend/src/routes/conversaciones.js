// ============================================================
//  Rutas: /api/conversaciones (bandeja de agentes)
//  - toggle-ia: activar/desactivar IA dentro del chat (solo tras handoff)
//  - mensajes: solo permitido cuando modo='humano'
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const axios = require('axios');

const conversacionModel = require('../models/conversacion');
const contactoModel = require('../models/contacto');
const mensajeModel = require('../models/mensaje');
const whatsappService = require('../services/whatsappService');
const handoffService = require('../services/handoffService');

// --- GET /api/conversaciones/media/:mensajeId -> proxy de media de Meta ---
// Los archivos multimedia de Meta requieren token Bearer para descargar.
// Este endpoint los proxya para que el frontend pueda reproducirlos.
router.get('/media/:mensajeId', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const env = require('../config/env');
    const token = req.query.t || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autenticado.' });
    try { jwt.verify(token, env.JWT_SECRET); } catch (_) { return res.status(401).json({ error: 'Token invalido.' }); }

    const msg = mensajeModel.findById(req.params.mensajeId);
    if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado.' });
    let contenido;
    try { contenido = JSON.parse(msg.contenido); } catch (_) { return res.status(400).json({ error: 'Contenido invalido.' }); }
    const mediaUrl = contenido.url || contenido.id;
    if (!mediaUrl) return res.status(404).json({ error: 'Sin URL de media.' });

    // Si es URL local (uploads), redirigir.
    if (mediaUrl.startsWith('/uploads/')) return res.redirect(mediaUrl);

    // Es URL de Meta: descargar con token y streamear.
    const creds = whatsappService.getCredentials();
    const resp = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${creds.token}` },
      responseType: 'stream',
      timeout: 30000,
    });
    res.setHeader('Content-Type', resp.headers['content-type'] || 'application/octet-stream');
    if (resp.headers['content-length']) res.setHeader('Content-Length', resp.headers['content-length']);
    resp.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener media.' });
  }
});
const { getIo } = require('../sockets');
const logger = require('../utils/logger');

// --- GET /api/conversaciones -> lista con filtros ---
router.get('/', requireAuth, (req, res) => {
  const { modo, estado, soloMias } = req.query;
  const lista = conversacionModel.list({
    modo: modo || null,
    estado: estado || null,
    agenteId: req.user.id,
    soloMias: soloMias === 'true',
  });
  res.json(lista);
});

// --- GET /api/conversaciones/:id -> detalle con mensajes ---
router.get('/:id', requireAuth, (req, res) => {
  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  const contacto = contactoModel.findById(conv.contacto_id);
  const mensajes = mensajeModel.listByConversacion(conv.id, 500);
  const mensajesParsed = mensajes.map(m => {
    let contenido;
    try { contenido = JSON.parse(m.contenido); } catch (_) { contenido = { text: m.contenido }; }
    return { ...m, contenido };
  });
  // Incluir nombre del agente que tiene la conversación.
  let agente_username = null;
  if (conv.agente_id) {
    const agente = require('../models/usuario').findById(conv.agente_id);
    agente_username = agente ? (agente.nombre || agente.username) : null;
  }
  res.json({ conversacion: { ...conv, agente_username }, contacto, mensajes: mensajesParsed });
});

// --- POST /api/conversaciones/:id/tomar -> agente toma la conversacion ---
router.post('/:id/tomar', requireAuth, (req, res) => {
  const conv = handoffService.tomarConversacion(req.params.id, req.user.id);
  const io = getIo();
  if (io) io.to('agentes').emit('conv_tomada', { conversacion_id: req.params.id, agente_id: req.user.id, agente_nombre: req.user.nombre || req.user.username });
  res.json({ ok: true, conversacion: conv });
});

// --- POST /api/conversaciones/:id/soltar -> agente suelta la conversacion ---
router.post('/:id/soltar', requireAuth, (req, res) => {
  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  if (conv.agente_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes soltar una conversacion que no tienes.' });
  }
  conversacionModel.setAgente(req.params.id, null);
  conversacionModel.setEstado(req.params.id, 'pendiente');
  const io = getIo();
  if (io) io.to('agentes').emit('conv_soltada', { conversacion_id: req.params.id });
  logger.info('Conversacion soltada', { convId: req.params.id, agente: req.user.id }, 'sistema', false);
  res.json({ ok: true, conversacion: conversacionModel.findById(req.params.id) });
});

// --- POST /api/conversaciones/:id/toggle-ia -> activar/desactivar IA en el chat ---
router.post('/:id/toggle-ia', requireAuth, (req, res) => {
  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  if (conv.modo === 'ia') {
    conversacionModel.setModo(req.params.id, 'humano');
    logger.info('IA desactivada en chat', { convId: req.params.id }, 'sistema', false);
  } else {
    conversacionModel.setModo(req.params.id, 'ia');
    logger.info('IA activada en chat', { convId: req.params.id }, 'sistema', false);
  }
  res.json({ ok: true, conversacion: conversacionModel.findById(req.params.id) });
});

// --- POST /api/conversaciones/:id/mensajes -> envio manual del agente ---
// Solo permitido cuando modo='humano'.
// Body: { text, reply_to? }  donde reply_to es el ID del mensaje citado.
router.post('/:id/mensajes', requireAuth, async (req, res) => {
  const { text, reply_to } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Mensaje vacio.' });

  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });

  if (conv.modo !== 'humano') {
    return res.status(403).json({ error: 'No puedes enviar mensajes mientras la conversacion esta siendo manejada por bot o IA.' });
  }

  if (conv.agente_id && conv.agente_id !== req.user.id) {
    return res.status(403).json({ error: 'Esta conversacion esta siendo atendida por otro agente.' });
  }

  const contacto = contactoModel.findById(conv.contacto_id);
  if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });

  const ventanaOk = conv.ventana_24h_hasta && new Date(conv.ventana_24h_hasta) > new Date();

  try {
    let wamId = null;
    if (ventanaOk) {
      // Si hay reply_to, obtener el wam_id del mensaje citado para el context de Meta.
      let contextWamId = null;
      if (reply_to) {
        const quotedMsg = mensajeModel.findById(reply_to);
        if (quotedMsg && quotedMsg.wam_id) contextWamId = quotedMsg.wam_id;
      }
      const sendResp = await whatsappService.sendText(contacto.wa_id, text, contextWamId);
      wamId = sendResp?.messages?.[0]?.id || null;
    } else {
      return res.status(403).json({ error: 'Ventana de 24 horas expirada. Usa una plantilla para reabrir la conversacion.' });
    }

    mensajeModel.insert({
      conversacion_id: conv.id, contacto_id: contacto.id, wam_id: wamId,
      direccion: 'out', tipo: 'text', contenido: { text }, origen: 'humano', status: 'sent',
      reply_to: reply_to || null,
    });
    conversacionModel.tocar(conv.id);

    const io = getIo();
    if (io) io.to('agentes').emit('mensaje_enviado', {
      conversacion_id: conv.id, contacto_id: contacto.id,
      tipo: 'text', contenido: { text }, origen: 'humano', timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, wam_id: wamId });
  } catch (err) {
    logger.error('Error envio manual', { message: err.message }, 'whatsapp');
    res.status(500).json({ error: whatsappService.interpretarErrorMeta(err) });
  }
});

// --- POST /api/conversaciones/:id/media -> enviar archivo/imagen/audio ---
// Body: { filename, base64, mimetype, caption, reply_to? }
router.post('/:id/media', requireAuth, async (req, res) => {
  const { filename, base64, mimetype, caption, reply_to } = req.body || {};
  if (!filename || !base64) return res.status(400).json({ error: 'Archivo requerido.' });

  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  if (conv.modo !== 'humano') return res.status(403).json({ error: 'No puedes enviar mensajes mientras la conversacion esta siendo manejada por bot o IA.' });
  if (conv.agente_id && conv.agente_id !== req.user.id) return res.status(403).json({ error: 'Esta conversacion esta siendo atendida por otro agente.' });

  const contacto = contactoModel.findById(conv.contacto_id);
  if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });

  const ventanaOk = conv.ventana_24h_hasta && new Date(conv.ventana_24h_hasta) > new Date();
  if (!ventanaOk) return res.status(403).json({ error: 'Ventana de 24 horas expirada.' });

  try {
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const savedName = Date.now() + '_' + safeName;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    // Si hay reply_to, obtener el wam_id del mensaje citado para el context de Meta.
    let contextWamId = null;
    if (reply_to) {
      const quotedMsg = mensajeModel.findById(reply_to);
      if (quotedMsg && quotedMsg.wam_id) contextWamId = quotedMsg.wam_id;
    }

    const mediaResp = await whatsappService.sendMedia(
      contacto.wa_id, filePath, filename, mimetype || 'application/octet-stream', caption || '', contextWamId
    );
    const wamId = mediaResp?.messages?.[0]?.id || null;
    const isImage = mimetype && mimetype.startsWith('image/');
    const isMetaAudio = mimetype && (
      mimetype.startsWith('audio/ogg') ||
      mimetype.startsWith('audio/aac') ||
      mimetype.startsWith('audio/mp4') ||
      mimetype.startsWith('audio/mpeg') ||
      mimetype.startsWith('audio/amr')
    );
    const isVideo = mimetype && mimetype.startsWith('video/');
    const tipo = isImage ? 'image' : isMetaAudio ? 'audio' : isVideo ? 'video' : 'document';

    mensajeModel.insert({
      conversacion_id: conv.id, contacto_id: contacto.id, wam_id: wamId,
      direccion: 'out', tipo, contenido: { filename, url: '/uploads/' + savedName, caption: caption || '' },
      origen: 'humano', status: 'sent',
      reply_to: reply_to || null,
    });
    conversacionModel.tocar(conv.id);

    const io = getIo();
    if (io) io.to('agentes').emit('mensaje_enviado', {
      conversacion_id: conv.id, contacto_id: contacto.id,
      tipo, contenido: { filename, url: '/uploads/' + savedName, caption: caption || '' },
      origen: 'humano', timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, wam_id: wamId });
  } catch (err) {
    logger.error('Error envio media', { message: err.message }, 'whatsapp');
    res.status(500).json({ error: whatsappService.interpretarErrorMeta(err) });
  }
});

// --- POST /api/conversaciones/:id/template -> enviar plantilla ---
router.post('/:id/template', requireAuth, async (req, res) => {
  const { template_name, language } = req.body;
  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  const contacto = contactoModel.findById(conv.contacto_id);
  if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });
  if (!template_name) return res.status(400).json({ error: 'Nombre de plantilla requerido.' });

  try {
    const sendResp = await whatsappService.sendTemplate(contacto.wa_id, template_name, language || 'es_MX');
    const wamId = sendResp?.messages?.[0]?.id || null;
    mensajeModel.insert({
      conversacion_id: conv.id, contacto_id: contacto.id, wam_id: wamId,
      direccion: 'out', tipo: 'template', contenido: { template_name }, origen: 'humano', status: 'sent',
    });
    conversacionModel.renovarVentana24h(conv.id);
    res.json({ ok: true, wam_id: wamId });
  } catch (err) {
    res.status(500).json({ error: whatsappService.interpretarErrorMeta(err) });
  }
});

// --- POST /api/conversaciones/:id/forward -> reenviar mensajes a otros contactos ---
// Body: { message_ids: [int], target_contacto_ids: [int] }
// Envia el contenido de los mensajes seleccionados a los contactos destino.
// Respeta la ventana de 24h: texto dentro, falla fuera.
router.post('/:id/forward', requireAuth, async (req, res) => {
  const { message_ids, target_contacto_ids } = req.body || {};
  if (!Array.isArray(message_ids) || message_ids.length === 0) {
    return res.status(400).json({ error: 'No hay mensajes seleccionados.' });
  }
  if (!Array.isArray(target_contacto_ids) || target_contacto_ids.length === 0) {
    return res.status(400).json({ error: 'No hay contactos seleccionados.' });
  }

  const mensajesOriginales = mensajeModel.findByIds(message_ids);
  if (mensajesOriginales.length === 0) {
    return res.status(404).json({ error: 'Mensajes no encontrados.' });
  }

  let enviados = 0;
  let fallidos = 0;
  const detalles = [];

  for (const contactoId of target_contacto_ids) {
    const contacto = contactoModel.findById(contactoId);
    if (!contacto || contacto.deleted) {
      fallidos++;
      detalles.push({ contacto_id: contactoId, estado: 'error', error: 'Contacto no encontrado o eliminado.' });
      continue;
    }

    const conv = conversacionModel.getOrCreate(contacto.id);
    const ventanaOk = conv.ventana_24h_hasta && new Date(conv.ventana_24h_hasta) > new Date();

    if (!ventanaOk) {
      for (const _msg of mensajesOriginales) {
        fallidos++;
      }
      detalles.push({ contacto_id: contactoId, wa_id: contacto.wa_id, estado: 'error', error: 'Ventana de 24h expirada.' });
      continue;
    }

    for (const msg of mensajesOriginales) {
      try {
        let texto = '';
        try {
          const c = JSON.parse(msg.contenido);
          texto = c.text || c.body || c.caption || c.title || c.filename || '';
        } catch (_) { texto = ''; }
        if (!texto) {
          fallidos++;
          continue;
        }

        const sendResp = await whatsappService.sendText(contacto.wa_id, texto);
        const wamId = sendResp?.messages?.[0]?.id || null;

        mensajeModel.insert({
          conversacion_id: conv.id, contacto_id: contacto.id, wam_id: wamId,
          direccion: 'out', tipo: 'text', contenido: { text: texto },
          origen: 'humano', status: 'sent',
          forwarded_from: msg.id, forwarded: true,
        });
        conversacionModel.tocar(conv.id);
        enviados++;
      } catch (e) {
        fallidos++;
        logger.error('Error reenviando mensaje', { contacto: contacto.wa_id, msgId: msg.id, message: e.message }, 'whatsapp', false);
      }
    }
    detalles.push({ contacto_id: contactoId, wa_id: contacto.wa_id, estado: 'ok' });
  }

  const io = getIo();
  if (io) io.to('agentes').emit('mensaje_enviado', { timestamp: new Date().toISOString() });

  logger.info(`Reenvio: ${enviados} enviados, ${fallidos} fallidos`, null, 'sistema', false);
  res.json({ ok: true, enviados, fallidos, total: enviados + fallidos, detalles });
});

// --- DELETE /api/conversaciones/:id -> eliminar conversacion ---
router.delete('/:id', requireAuth, (req, res) => {
  const conv = conversacionModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada.' });
  conversacionModel.remove(req.params.id);
  logger.info(`Conversacion ${req.params.id} eliminada`, { userId: req.user.id }, 'sistema', false);
  res.json({ ok: true });
});

module.exports = router;
