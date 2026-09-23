// ============================================================
//  Servicio: Orquestador de modos (Nueva logica v2)
//
//  INICIO DE CONVERSACION (contacto nuevo):
//    - modo_inicio='bot' -> bot envia primer mensaje programado
//    - modo_inicio='ia'  -> IA responde
//
//  CONTINUIDAD (contacto existente):
//    - modo='bot' + bot_completado -> escalar a humano
//    - modo='bot' + !bot_completado -> continuar flujo del bot
//    - modo='ia'  -> IA responde
//    - modo='humano' -> no responder automatico
//
//  Bot solo activa para INICIOS. Nunca se reactiva.
//  User2 no puede enviar mensajes hasta escalar a humano.
// ============================================================
const conversacionModel = require('../models/conversacion');
const mensajeModel = require('../models/mensaje');
const whatsappService = require('./whatsappService');
const iaService = require('./iaService');
const flujosService = require('./flujosService');
const handoffService = require('./handoffService');
const { getIo } = require('../sockets');
const logger = require('../utils/logger');

const HISTORIAL_IA = 10;

// Obtiene el mensaje de escalamiento del flujo activo.
// Returns: string = mensaje personalizado, null = sin mensaje, undefined = mensaje default
function getMensajeEscalamiento() {
  try {
    const flujoBotModel = require('../models/flujoBot');
    const flujo = flujoBotModel.getActive();
    if (!flujo || !flujo.flujo) return undefined;
    if (flujo.flujo.mensaje_escalamiento_activo) {
      return flujo.flujo.mensaje_escalamiento || undefined;
    }
    return null;
  } catch (_) { return undefined; }
}

async function procesarMensajeEntrante(ctx) {
  const { contacto, conversacion, mensaje, isNewContact } = ctx;

  emitirMensajeRecibido(ctx);

  const conv = conversacionModel.findById(conversacion.id);
  const modo = conv.modo;

  logger.info(`Orquestador: ${contacto.wa_id} | modo=${modo} | nuevo=${isNewContact} | texto="${(mensaje.texto||'').slice(0,40)}"`, { convId: conv.id }, 'sistema', false);

  try {
    if (isNewContact) {
      await procesarInicioConversacion(ctx, conv);
    } else {
      await procesarContinuidad(ctx, conv);
    }
  } catch (err) {
    logger.error('Orquestador: error no manejado', { message: err.message, convId: conv.id }, 'sistema');
    await enviarYGuardar(ctx, 'Ocurrio un error. Intenta de nuevo en un momento.', 'sistema');
  }
}

// --- INICIO DE CONVERSACION (contacto nuevo) ---
async function procesarInicioConversacion(ctx, conv) {
  let modoInicio = 'bot';
  try {
    const configBotModel = require('../models/configBot');
    const cfgBot = configBotModel.getConfig();
    if (cfgBot.modo_inicio === 'ia') modoInicio = 'ia';
    if (cfgBot.modo_inicio === 'none') modoInicio = 'none';
  } catch (_) {}

  if (modoInicio === 'none') {
    // Sin bot ni IA: la conversación va directo a humano, sin auto-respuesta.
    // Se marca handoff_ocurrido=1 para que el agente pueda activar IA si lo desea.
    conversacionModel.setModo(conv.id, 'humano');
    conversacionModel.setEstado(conv.id, 'pendiente');
    const db = require('../config/database').getDb();
    db.prepare('UPDATE conversaciones SET handoff_ocurrido = 1 WHERE id = ?').run(conv.id);
    const io = require('../sockets').getIo();
    if (io) io.to('agentes').emit('handoff_solicitado', { conversacion_id: conv.id, contacto_id: ctx.contacto.id });
  } else if (modoInicio === 'ia') {
    conversacionModel.setModo(conv.id, 'ia');
    await responderConIA(ctx, conversacionModel.findById(conv.id));
  } else {
    conversacionModel.setModo(conv.id, 'bot');
    await iniciarFlujoBot(ctx, conversacionModel.findById(conv.id));
  }
}

// --- CONTINUIDAD (contacto existente) ---
async function procesarContinuidad(ctx, conv) {
  const modo = conv.modo;

  switch (modo) {
    case 'humano':
      return;
    case 'ia':
      await responderConIA(ctx, conv);
      return;
    case 'bot':
    default:
      if (conversacionModel.isBotCompletado(conv.id)) {
        await handoffService.activarHandoff(conv.id, 'flujo_completado', getMensajeEscalamiento());
      } else {
        await continuarFlujoBot(ctx, conv);
      }
      return;
  }
}

// --- Iniciar flujo del bot: enviar primer mensaje sin importar el input ---
async function iniciarFlujoBot(ctx, conv) {
  const resultado = flujosService.construirBienvenida();
  if (!resultado) {
    await handoffService.activarHandoff(conv.id, 'flujo_completado', getMensajeEscalamiento());
    return;
  }
  if (resultado.escalarHumano) {
    await handoffService.activarHandoff(conv.id, 'flujo', getMensajeEscalamiento());
    return;
  }
  await enviarRespuestaBot(ctx, resultado);
}

// --- Continuar flujo del bot: procesar respuesta del cliente ---
async function continuarFlujoBot(ctx, conv) {
  let resultado;
  try {
    resultado = flujosService.procesarMensaje(ctx);
  } catch (e) {
    logger.error('Error en procesarMensaje del bot', { message: e.message, convId: conv.id }, 'sistema');
    const fallback = flujosService.construirFallback(null);
    await enviarRespuestaBot(ctx, fallback);
    return;
  }

  if (resultado.escalarHumano) {
    await handoffService.activarHandoff(conv.id, 'palabra_clave', getMensajeEscalamiento());
    return;
  }

  if (resultado.flujoCompletado) {
    conversacionModel.setBotCompletado(conv.id);
    await enviarRespuestaBot(ctx, resultado);
    await handoffService.activarHandoff(conv.id, 'flujo_completado', getMensajeEscalamiento());
    return;
  }

  if (resultado.coincidencia) {
    await enviarRespuestaBot(ctx, resultado);
    return;
  }

  const fallback = flujosService.construirFallback(null);
  await enviarRespuestaBot(ctx, fallback);
}

// --- MODO IA ---
async function responderConIA(ctx, conv) {
  const cfgIa = iaService.getActiveConfig();
  if (!cfgIa || !cfgIa.ia_enabled) {
    await handoffService.activarHandoff(conv.id, 'ia_deshabilitada');
    return;
  }
  await intentarIA(ctx, conv);
}

async function intentarIA(ctx, conv) {
  const cfgIa = iaService.getActiveConfig();
  const usados = conversacionModel.getContadorIa(conv.id);
  if (usados >= cfgIa.max_messages_per_day) {
    conversacionModel.setModo(conv.id, 'humano');
    await enviarYGuardar(ctx, 'He alcanzado el limite de respuestas automaticas por hoy. Te transfero con un asesor.', 'sistema');
    await handoffService.activarHandoff(conv.id, 'limite_ia');
    emitirNotificacionPanel(conv.id, 'Limite IA alcanzado', 'warn');
    return;
  }

  const historial = mensajeModel.historialParaIa(conv.id, HISTORIAL_IA);
  const resp = await iaService.generateResponse(historial, {
    conversacionId: conv.id,
    contactoId: ctx.contacto.id,
  });

  if (resp.error) {
    logger.warn(`IA fallo: ${resp.error}.`, { convId: conv.id }, 'ia');
    await handoffService.activarHandoff(conv.id, 'ia_error');
    return;
  }

  if (resp.escalarHumano) {
    conversacionModel.incrementarContadorIa(conv.id);
    await handoffService.activarHandoff(conv.id, 'ia');
    return;
  }

  conversacionModel.incrementarContadorIa(conv.id);
  await enviarYGuardar(ctx, resp.text || '...', 'ia');
}

// --- Helpers de envio ---
async function enviarRespuestaBot(ctx, resultado) {
  const { contacto, conversacion } = ctx;
  try {
    let wamId = null;
    if (resultado.tipo === 'buttons' && resultado.buttons && resultado.buttons.length > 0) {
      const sendResp = await whatsappService.sendButtons(contacto.wa_id, resultado.texto, resultado.buttons);
      wamId = sendResp?.messages?.[0]?.id || null;
    } else {
      const sendResp = await whatsappService.sendText(contacto.wa_id, resultado.texto);
      wamId = sendResp?.messages?.[0]?.id || null;
    }
    guardarMensajeSalida(conversacion.id, contacto.id, wamId, resultado, 'bot');
  } catch (err) {
    logger.error('Bot: error enviando mensaje', { message: err.message }, 'whatsapp');
    guardarMensajeSalida(conversacion.id, contacto.id, null, resultado, 'bot', 'failed', err.message);
  }
}

async function enviarYGuardar(ctx, texto, origen) {
  const { contacto, conversacion } = ctx;
  try {
    const sendResp = await whatsappService.sendText(contacto.wa_id, texto);
    const wamId = sendResp?.messages?.[0]?.id || null;
    guardarMensajeSalida(conversacion.id, contacto.id, wamId, { tipo: 'text', texto }, origen);
  } catch (err) {
    logger.error(`Error enviando mensaje (${origen})`, { message: err.message }, 'whatsapp');
    guardarMensajeSalida(conversacion.id, contacto.id, null, { tipo: 'text', texto }, origen, 'failed', err.message);
  }
}

function guardarMensajeSalida(convId, contactoId, wamId, resultado, origen, status = 'sent', error = null) {
  const tipo = resultado.tipo === 'buttons' ? 'interactive' : 'text';
  const contenido = tipo === 'interactive'
    ? { text: resultado.texto, buttons: resultado.buttons }
    : { text: resultado.texto };
  mensajeModel.insert({
    conversacion_id: convId, contacto_id: contactoId, wam_id: wamId,
    direccion: 'out', tipo, contenido, origen, status, error,
  });
  conversacionModel.tocar(convId);
  emitirMensajeEnviado(convId, contactoId, tipo, contenido, origen);
}

function emitirMensajeRecibido(ctx) {
  const io = getIo();
  if (!io) return;
  io.to('agentes').emit('mensaje_recibido', {
    conversacion_id: ctx.conversacion.id,
    contacto: { id: ctx.contacto.id, wa_id: ctx.contacto.wa_id, nombre: ctx.contacto.nombre },
    mensaje: { tipo: ctx.mensaje.tipo, texto: ctx.mensaje.texto },
    timestamp: new Date().toISOString(),
  });
}

function emitirMensajeEnviado(convId, contactoId, tipo, contenido, origen) {
  const io = getIo();
  if (!io) return;
  io.to('agentes').emit('mensaje_enviado', {
    conversacion_id: convId, contacto_id: contactoId,
    tipo, contenido, origen, timestamp: new Date().toISOString(),
  });
}

function emitirNotificacionPanel(convId, mensaje, nivel = 'info') {
  const io = getIo();
  if (!io) return;
  io.to('agentes').emit('notificacion', { conversacion_id: convId, mensaje, nivel, timestamp: new Date().toISOString() });
}

module.exports = { procesarMensajeEntrante };
