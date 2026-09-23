// ============================================================
//  Servicio: Human Handoff (Módulo 5 - núcleo)
//  Activacion: boton del flujo, palabra clave ("asesor"),
//  o etiqueta [ESCALAR_HUMANO] de la IA.
//  Al activarse:
//    - estado conversacion -> modo_humano
//    - notificacion a agentes (Socket.io: sonido + toast)
//    - respuesta al cliente: "Un asesor te atendera en unos momentos"
// ============================================================
const conversacionModel = require('../models/conversacion');
const contactoModel = require('../models/contacto');
const whatsappService = require('./whatsappService');
const { getIo } = require('../sockets');
const logger = require('../utils/logger');

// --- Activa el handoff para una conversacion ---
// motivo: 'flujo' | 'palabra_clave' | 'ia' | 'flujo_completado'
// mensajeEscalamiento: undefined = mensaje default, null = sin mensaje, string = mensaje personalizado
async function activarHandoff(conversacionId, motivo = 'flujo', mensajeEscalamiento = undefined) {
  const conv = conversacionModel.findById(conversacionId);
  if (!conv) return;
  if (conv.modo === 'humano') return;

  conversacionModel.setModo(conversacionId, 'humano');
  conversacionModel.setEstado(conversacionId, 'pendiente');
  const db = require('../config/database').getDb();
  db.prepare('UPDATE conversaciones SET handoff_ocurrido = 1 WHERE id = ?').run(conversacionId);

  const contacto = contactoModel.findById(conv.contacto_id);
  if (!contacto) {
    logger.warn(`Handoff: contacto no encontrado para conversacion ${conversacionId}`, null, 'sistema', false);
    return;
  }

  // Notificar al cliente: personalizado, default, o ninguno.
  if (mensajeEscalamiento !== null) {
    const msg = mensajeEscalamiento || 'Un asesor te atendera en unos momentos. 🕐';
    try {
      await whatsappService.sendText(contacto.wa_id, msg);
    } catch (e) {
      logger.error('Handoff: no se pudo notificar al cliente', { message: e.message }, 'whatsapp');
    }
  }

  // Notificar a los agentes por Socket.io (toast + sonido).
  const io = getIo();
  if (io) {
    io.to('agentes').emit('handoff_solicitado', {
      conversacion_id: conversacionId,
      contacto: { id: contacto.id, wa_id: contacto.wa_id, nombre: contacto.nombre },
      motivo,
      timestamp: new Date().toISOString(),
    });
  }

  logger.info(`Handoff activado (motivo: ${motivo}) para conversacion ${conversacionId}`, { contacto: contacto.wa_id }, 'sistema', false);
}

// --- Devuelve una conversacion al bot (solo si no hubo handoff) ---
function devolverAlBot(conversacionId) {
  const conv = conversacionModel.findById(conversacionId);
  if (!conv) return;
  if (conv.handoff_ocurrido) {
    logger.warn(`No se puede devolver al bot: handoff ocurrido en conversacion ${conversacionId}`, null, 'sistema', false);
    return false;
  }
  conversacionModel.setModo(conversacionId, 'bot');
  conversacionModel.setEstado(conversacionId, 'activa');
  conversacionModel.setAgente(conversacionId, null);
  conversacionModel.setPasoFlujo(conversacionId, null);
  logger.info(`Conversacion ${conversacionId} devuelta al bot.`, null, 'sistema', false);
  return true;
}

// --- Activa IA en una conversacion especifica ---
function activarIaConversacion(conversacionId) {
  conversacionModel.setModo(conversacionId, 'ia');
  logger.info(`IA activada para conversacion ${conversacionId}.`, null, 'sistema', false);
}

// --- Un agente toma la conversacion (asignacion unica) ---
function tomarConversacion(conversacionId, agenteId) {
  conversacionModel.setAgente(conversacionId, agenteId);
  conversacionModel.setEstado(conversacionId, 'activa');
  return conversacionModel.findById(conversacionId);
}

module.exports = { activarHandoff, devolverAlBot, activarIaConversacion, tomarConversacion };
