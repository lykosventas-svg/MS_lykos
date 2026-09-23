// ============================================================
//  Servicio: Webhook de WhatsApp Cloud API
//  - verifySignature: valida X-Hub-Signature-256 (HMAC-SHA256 con App Secret)
//  - processIncoming: parsea, deduplica, guarda y delega al orquestador
//  - handleStatus: actualiza estado de mensajes enviados
// ============================================================
const crypto = require('crypto');
const configWaModel = require('../models/configWhatsApp');
const contactoModel = require('../models/contacto');
const conversacionModel = require('../models/conversacion');
const mensajeModel = require('../models/mensaje');
const logger = require('../utils/logger');

// --- Validacion de firma X-Hub-Signature-256 ---
// signature viene como "sha256=<hex>". Se verifica con HMAC-SHA256
// usando el App Secret de Meta como clave sobre el raw body.
function verifySignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false;
  const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  // Comparacion constante-tiempo para evitar timing attacks.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'));
  } catch (_) {
    return false;
  }
}

// --- Deduplicacion de eventos por message id ---
function isDuplicate(wamId) {
  if (!wamId) return false;
  const { getDb } = require('../config/database');
  try {
    getDb().prepare('INSERT INTO eventos_procesados (event_id) VALUES (?)').run(wamId);
    return false; // insertado => no era duplicado
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return true; // duplicado
    throw e; // otro error: propagar
  }
}

// --- Parseo de un mensaje entrante a estructura normalizada ---
// Devuelve { tipo, contenido, texto } donde contenido es JSON para BD.
function parseMessage(msg) {
  const tipo = msg.type || 'unknown';
  const contenido = {};
  let texto = '';

  switch (tipo) {
    case 'text':
      contenido.text = msg.text?.body || '';
      texto = contenido.text;
      break;
    case 'image':
      contenido.caption = msg.image?.caption || '';
      contenido.url = msg.image?.url || '';
      contenido.id = msg.image?.id || '';
      texto = contenido.caption || '[imagen]';
      break;
    case 'audio':
      contenido.url = msg.audio?.url || '';
      contenido.id = msg.audio?.id || '';
      texto = '[audio]';
      break;
    case 'video':
      contenido.caption = msg.video?.caption || '';
      contenido.url = msg.video?.url || '';
      texto = contenido.caption || '[video]';
      break;
    case 'document':
      contenido.caption = msg.document?.caption || '';
      contenido.filename = msg.document?.filename || '';
      contenido.url = msg.document?.url || '';
      texto = contenido.filename || contenido.caption || '[documento]';
      break;
    case 'location':
      contenido.lat = msg.location?.latitude;
      contenido.lng = msg.location?.longitude;
      contenido.name = msg.location?.name || '';
      contenido.address = msg.location?.address || '';
      texto = `[ubicacion: ${contenido.lat}, ${contenido.lng}]`;
      break;
    case 'interactive':
      // Puede ser button_reply o list_reply
      if (msg.interactive?.type === 'button_reply') {
        contenido.id = msg.interactive.button_reply?.id || '';
        contenido.title = msg.interactive.button_reply?.title || '';
        contenido.interactive_type = 'button';
      } else if (msg.interactive?.type === 'list_reply') {
        contenido.id = msg.interactive.list_reply?.id || '';
        contenido.title = msg.interactive.list_reply?.title || '';
        contenido.description = msg.interactive.list_reply?.description || '';
        contenido.interactive_type = 'list';
      } else if (msg.interactive?.type === 'nfm_reply') {
        contenido.id = msg.interactive.nfm_reply?.response_json || '';
        contenido.interactive_type = 'nfm';
      }
      texto = contenido.title || contenido.id || '[interactivo]';
      break;
    case 'button':
      contenido.id = msg.button?.id || '';
      contenido.text = msg.button?.text || '';
      contenido.button_type = 'quick_reply';
      texto = contenido.text || contenido.id;
      break;
    case 'reaction':
      contenido.emoji = msg.reaction?.emoji || '';
      contenido.message_id = msg.reaction?.message_id || '';
      texto = `[reaccion: ${contenido.emoji}]`;
      break;
    case 'contacts':
      contenido.contacts = msg.contacts || [];
      texto = '[contactos]';
      break;
    case 'order':
      contenido.order = msg.order || {};
      texto = '[pedido]';
      break;
    case 'system':
      contenido.text = msg.system?.body || '';
      texto = contenido.text;
      break;
    default:
      contenido.raw = JSON.stringify(msg);
      texto = `[mensaje tipo ${tipo}]`;
  }

  return { tipo, contenido, texto };
}

// --- Procesa un payload completo del webhook ---
// Esta funcion es async y NO debe bloquear la respuesta 200 a Meta.
async function processIncoming(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account') return;

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      // --- Mensajes entrantes y actualizaciones de estado ---
      if (change.field === 'messages') {
        // Filtrar: solo procesar eventos del phone_number_id configurado.
        // Meta envía webhooks de TODOS los números del WABA; ignoramos los que
        // no correspondan al número actualmente configurado en el panel.
        const configuredPhoneId = configWaModel.getRaw().phone_number_id;
        const incomingPhoneId = value.metadata?.phone_number_id;
        if (configuredPhoneId && incomingPhoneId &&
            String(configuredPhoneId) !== String(incomingPhoneId)) {
          logger.info(
            `Webhook: evento ignorado (phone_id ${incomingPhoneId} ≠ configurado ${configuredPhoneId})`,
            null, 'whatsapp', false
          );
          continue;
        }

        if (value.messages) {
          await procesarMensajes(value);
        }

        if (value.statuses) {
          procesarEstados(value.statuses);
        }
      } else {
        // TEMPORAL (discovery): log de eventos no manejados (ej. llamadas).
        // Esto captura cualquier evento de WhatsApp Business Calling u otros.
        logger.info(
          `Webhook DISCOVERY: field=${change.field}`,
          JSON.stringify(value).slice(0, 1000),
          'whatsapp', false
        );
      }
    }
  }
}

// --- Procesa mensajes entrantes de un cambio ---
async function procesarMensajes(value) {
  const contacts = value.contacts || [];
  const messages = value.messages || [];

  for (const msg of messages) {
    const wamId = msg.id;

    // Deduplicar: Meta puede reenviar el mismo evento.
    if (isDuplicate(wamId)) {
      logger.info('Webhook: evento duplicado ignorado', { wamId }, 'whatsapp', false);
      continue;
    }

    // Buscar el contacto correspondiente al mensaje.
    const contactInfo = contacts.find(c => c.wa_id === msg.from) || contacts[0] || {};
    const waId = msg.from || contactInfo.wa_id;
    if (!waId) continue;

    // Determinar si es INICIO DE CONVERSACIÓN.
    // Se deben cumplir DOS condiciones:
    // 1. El contacto NO está en el módulo contactos (no existe o está soft-deleted)
    // 2. NO existe ningún registro de conversación con este contacto
    // Si alguna no se cumple → es MENSAJE DE CONTINUIDAD.
    const contactoExistente = contactoModel.findByWaId(waId);
    const contactNotInModule = !contactoExistente || contactoExistente.deleted === 1;
    const convExistente = contactoExistente ? conversacionModel.findByContacto(contactoExistente.id) : null;
    const noConversationRecord = !convExistente;
    const isNewContact = contactNotInModule && noConversationRecord;

    // Upsert contacto (restaura si estaba soft-deleted).
    const contacto = contactoModel.upsert({ wa_id: waId, nombre: contactInfo.profile?.name });

    // Obtener/crear conversacion.
    const conv = conversacionModel.getOrCreate(contacto.id);

    // Si es CONTINUIDAD pero no había conversación activa (fue creada nueva por
    // getOrCreate porque se eliminó o estaba cerrada), poner en modo humano.
    // El bot NUNCA inicia en mensajes de continuidad.
    const hadActiveConv = convExistente && convExistente.estado !== 'cerrada';
    if (!isNewContact && !hadActiveConv) {
      conversacionModel.setModo(conv.id, 'humano');
      conversacionModel.setEstado(conv.id, 'pendiente');
    }

    conversacionModel.renovarVentana24h(conv.id);
    conversacionModel.tocar(conv.id);

    // Parsear mensaje.
    const { tipo, contenido, texto } = parseMessage(msg);

    // Detectar boton "Enterado" de notificaciones (ID: enterado_<usuarioId>).
    if (tipo === 'interactive' && contenido.id && contenido.id.startsWith('enterado_')) {
      const usuarioId = parseInt(contenido.id.replace('enterado_', ''), 10);
      try {
        const notifModel = require('../models/notificacionModel');
        notifModel.detenerRecurrencia(usuarioId);
        notifModel.logEnvio({ usuario_id: usuarioId, via: 'whatsapp', destino: waId, mensaje: 'Notificaciones detenidas por boton Enterado', estado: 'ok' });
        logger.info(`Notificaciones detenidas por boton Enterado de usuario ${usuarioId}`, null, 'sistema', false);
        // Enviar confirmacion al empleado.
        try { await require('./whatsappService').sendText(waId, 'Has sido dado de enterado. No recibiras mas notificaciones recurrentes.'); } catch (_) {}
      } catch (_) {}
      continue; // no procesar mas este mensaje (no es de un cliente del negocio).
    }

    // Guardar mensaje entrante.
    mensajeModel.insert({
      conversacion_id: conv.id,
      contacto_id: contacto.id,
      wam_id: wamId,
      direccion: 'in',
      tipo,
      contenido,
      origen: 'webhook',
      status: 'delivered',
    });

    logger.info(`Webhook: mensaje de ${waId} (${tipo}): ${texto.slice(0, 60)}`, { wamId, convId: conv.id }, 'whatsapp', false);

    // Notificar a usuarios configurados (fire and forget, no bloquea).
    try {
      const notifService = require('./notificacionService');
      notifService.notificarNuevoMensaje(contactInfo.profile?.name, texto).catch(() => {});
    } catch (_) {}

    // Delegar al orquestador de modos (Módulo 3).
    // Se importa aqui para evitar dependencia circular al cargar.
    try {
      const orquestador = require('./orquestador');
      await orquestador.procesarMensajeEntrante({
        contacto, conversacion: conv, mensaje: { tipo, contenido, texto, wamId }, isNewContact,
      });
    } catch (e) {
      logger.error('Error en orquestador', { message: e.message, wamId }, 'whatsapp');
    }
  }
}

// --- Procesa actualizaciones de estado de mensajes enviados ---
function procesarEstados(statuses) {
  for (const st of statuses) {
    try {
      mensajeModel.updateStatus(st.id, st.status);
      if (st.status === 'failed') {
        const errCode = st.errors?.[0]?.code;
        const errMsg = st.errors?.[0]?.error_data?.details || st.errors?.[0]?.message || 'sin detalles';
        logger.error(`Webhook: mensaje FAILED para ${st.id}: ${errMsg}`, { code: errCode }, 'whatsapp');
        // Si el error es 131047 (ventana 24h expirada), marcar la conversacion como expirada.
        if (errCode === 131047) {
          try {
            const { getDb } = require('../config/database');
            getDb().prepare("UPDATE conversaciones SET ventana_24h_hasta = datetime('now','-1 hour') WHERE id IN (SELECT conversacion_id FROM mensajes WHERE wam_id = ?)").run(st.id);
          } catch (_) {}
        }
      } else {
        logger.info(`Webhook: estado ${st.status} para ${st.id}`, null, 'whatsapp', false);
      }
    } catch (_) { /* ignorar */ }
  }
}

module.exports = { verifySignature, isDuplicate, parseMessage, processIncoming, procesarEstados };
