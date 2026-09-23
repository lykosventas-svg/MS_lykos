// ============================================================
//  Rutas: /api/mensajes-masivos (CRUD + envio inteligente)
//  Admin only. Envio por contacto: texto (dentro 24h) o template (fuera 24h)
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const masivoModel = require('../models/mensajeMasivo');
const contactoModel = require('../models/contacto');
const whatsappService = require('../services/whatsappService');
const conversacionModel = require('../models/conversacion');
const mensajeModel = require('../models/mensaje');
const { getDb } = require('../config/database');
const logger = require('../utils/logger');

// Verifica si un contacto esta dentro de la ventana de 24h.
// Usa ventana_24h_hasta de la conversacion. Cuando Meta confirma que expiro
// (error 131047 via webhook), ventana_24h_hasta se marca en el pasado.
function contactoDentroDe24h(contactoId) {
  const db = getDb();
  const conv = db.prepare(
    `SELECT ventana_24h_hasta FROM conversaciones
     WHERE contacto_id = ?
     ORDER BY id DESC LIMIT 1`
  ).get(contactoId);
  if (!conv || !conv.ventana_24h_hasta) return false;
  return new Date(conv.ventana_24h_hasta + 'Z') > new Date();
}

// GET /api/mensajes-masivos -> listar todos
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(masivoModel.listForFrontend());
});

// POST /api/mensajes-masivos/check-ventana -> verificar ventana 24h de contactos
router.post('/check-ventana', requireAuth, requireAdmin, (req, res) => {
  const { contactos_ids, enviar_a_todos } = req.body || {};
  let contactos = [];
  if (enviar_a_todos) {
    contactos = contactoModel.listAll({ limit: 10000 });
  } else {
    contactos = (contactos_ids || []).map(id => contactoModel.findById(id)).filter(c => c && !c.deleted);
  }
  const resultado = contactos.map(c => ({
    id: c.id,
    wa_id: c.wa_id,
    nombre: c.nombre,
    dentro_24h: contactoDentroDe24h(c.id),
  }));
  const dentro = resultado.filter(r => r.dentro_24h).length;
  const fuera = resultado.length - dentro;
  res.json({ contactos: resultado, dentro_24h: dentro, fuera_24h: fuera, total: resultado.length });
});

// POST /api/mensajes-masivos -> crear
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = masivoModel.create({
    nombre: f.nombre,
    mensaje: f.mensaje,
    contactos: f.contactos,
    enviar_a_todos: f.enviar_a_todos,
    template_name: f.template_name,
    language: f.language,
    archivo_adjunto: f.archivo_adjunto,
  });
  res.json({ ok: true, config });
});

// PUT /api/mensajes-masivos/:id -> actualizar
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const f = req.body || {};
  const config = masivoModel.update(req.params.id, {
    nombre: f.nombre,
    mensaje: f.mensaje,
    contactos: f.contactos,
    enviar_a_todos: f.enviar_a_todos,
    template_name: f.template_name,
    language: f.language,
    archivo_adjunto: f.archivo_adjunto,
  });
  res.json({ ok: true, config });
});

// DELETE /api/mensajes-masivos/:id -> eliminar
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  masivoModel.remove(req.params.id);
  res.json({ ok: true });
});

// POST /api/mensajes-masivos/:id/enviar -> envio inteligente por contacto
router.post('/:id/enviar', requireAuth, requireAdmin, async (req, res) => {
  const masivo = masivoModel.findById(req.params.id);
  if (!masivo) return res.status(404).json({ error: 'Mensaje masivo no encontrado.' });

  let contactos = [];
  try { contactos = JSON.parse(masivo.contactos_json || '[]'); } catch (_) { contactos = []; }

  if (masivo.enviar_a_todos) {
    contactos = contactoModel.listAll({ limit: 10000 });
  } else {
    const ids = contactos;
    contactos = ids.map(id => contactoModel.findById(id)).filter(c => c && !c.deleted);
  }

  if (contactos.length === 0) return res.status(400).json({ error: 'No hay contactos seleccionados.' });

  let enviados = 0;
  let fallidos = 0;
  let enviadosTexto = 0;
  let enviadosTemplate = 0;
  let reintentosTemplate = 0;
  const total = contactos.length;
  const tieneMensaje = !!(masivo.mensaje && masivo.mensaje.trim());
  const tieneTemplate = !!masivo.template_name;
  let archivoAdjunto = null;
  try { archivoAdjunto = masivo.archivo_adjunto ? JSON.parse(masivo.archivo_adjunto) : null; } catch (_) {}

  for (const c of contactos) {
    try {
      const dentro24h = contactoDentroDe24h(c.id);
      let wamId = null;
      let usoTexto = false;

      if (dentro24h && tieneMensaje) {
        if (archivoAdjunto && archivoAdjunto.filename) {
          // Hay archivo adjunto: enviar solo el media con el texto como caption.
          const path = require('path');
          const fs = require('fs');
          const filePath = path.join(__dirname, '..', '..', '..', 'public', 'uploads', archivoAdjunto.filename);
          if (fs.existsSync(filePath)) {
            const mediaResp = await whatsappService.sendMedia(
              c.wa_id, filePath, archivoAdjunto.name || archivoAdjunto.filename,
              archivoAdjunto.mimetype || 'application/octet-stream', masivo.mensaje
            );
            wamId = mediaResp?.messages?.[0]?.id || null;
            usoTexto = true;
          } else {
            const resp = await whatsappService.sendText(c.wa_id, masivo.mensaje);
            wamId = resp?.messages?.[0]?.id || null;
            usoTexto = true;
          }
        } else {
          const resp = await whatsappService.sendText(c.wa_id, masivo.mensaje);
          wamId = resp?.messages?.[0]?.id || null;
          usoTexto = true;
        }
      } else if (!dentro24h && tieneTemplate) {
        const resp = await whatsappService.sendTemplate(c.wa_id, masivo.template_name, masivo.language || 'en_US');
        wamId = resp?.messages?.[0]?.id || null;
      } else {
        fallidos++;
        logger.warn('Envio masivo: contacto sin metodo aplicable', { contacto: c.wa_id, dentro24h, tieneMensaje, tieneTemplate }, 'whatsapp', false);
        continue;
      }

      // Guardar mensaje en la conversacion para rastrear)estado.
      const conv = conversacionModel.getOrCreate(c.id);
      mensajeModel.insert({
        conversacion_id: conv.id, contacto_id: c.id, wam_id: wamId,
        direccion: 'out', tipo: usoTexto ? 'text' : 'template',
        contenido: { text: masivo.mensaje, template_name: masivo.template_name },
        origen: 'humano', status: 'sent',
      });
      conversacionModel.tocar(conv.id);

      // Si fue texto, esperar 4s y verificar si Meta lo rechazo (error 131047).
      // Si fallo y hay template configurado, reintentar con template.
      if (usoTexto && wamId && tieneTemplate) {
        await new Promise(r => setTimeout(r, 4000));
        const msg = mensajeModel.findByWamId(wamId);
        if (msg && msg.status === 'failed') {
          logger.warn(`Texto fallido para ${c.wa_id}, reintentando con template...`, null, 'whatsapp', false);
          const resp2 = await whatsappService.sendTemplate(c.wa_id, masivo.template_name, masivo.language || 'en_US');
          const wamId2 = resp2?.messages?.[0]?.id || null;
          mensajeModel.insert({
            conversacion_id: conv.id, contacto_id: c.id, wam_id: wamId2,
            direccion: 'out', tipo: 'template',
            contenido: { template_name: masivo.template_name },
            origen: 'humano', status: 'sent',
          });
          reintentosTemplate++;
          enviadosTemplate++;
        } else {
          enviadosTexto++;
        }
      } else if (usoTexto) {
        enviadosTexto++;
      } else {
        enviadosTemplate++;
      }
      enviados++;
    } catch (e) {
      fallidos++;
      logger.error('Error envio masivo', { contacto: c.wa_id, message: e.message }, 'whatsapp', false);
    }
  }

  masivoModel.setResultado(masivo.id, enviados, fallidos, total);
  logger.info(`Mensaje masivo ${masivo.id}: ${enviados} ok (${enviadosTexto} texto, ${enviadosTemplate} template, ${reintentosTemplate} reintentos), ${fallidos} fallidos de ${total}`, null, 'sistema');
  res.json({ ok: true, enviados, fallidos, total, enviados_texto: enviadosTexto, enviados_template: enviadosTemplate, reintentos: reintentosTemplate });
});

module.exports = router;
