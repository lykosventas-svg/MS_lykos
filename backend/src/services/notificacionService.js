// ============================================================
//  Servicio: Notificaciones
//  - notificarNuevoMensaje: envia notificacion a usuarios activos
//  - chequearRecurrencia: envia notificaciones recurrentes pendientes
//  - detenerPorLogin: detiene recurrencia al iniciar sesion
//  Canales: WhatsApp (Cloud API) y Email (Nodemailer)
// ============================================================
const nodemailer = require('nodemailer');
const notifModel = require('../models/notificacionModel');
const whatsappService = require('./whatsappService');
const logger = require('../utils/logger');

let transporter = null;

// --- Construye el mensaje a enviar (personalizado o default) ---
function construirMensaje(userConfig, globalConfig, contactoNombre, mensajeTexto) {
  const url = globalConfig.url_software || '';
  const baseMsg = userConfig.mensaje_personalizado || globalConfig.mensaje_default || 'Tienes un nuevo mensaje de {contacto}: {preview}';
  return baseMsg
    .replace(/\{url\}/g, url)
    .replace(/\{contacto\}/g, contactoNombre || 'cliente')
    .replace(/\{preview\}/g, (mensajeTexto || '').slice(0, 50));
}

// --- Verifica si un numero esta dentro de la ventana de 24h ---
// Busca el contacto por wa_id, obtiene su conversacion y compara ventana_24h_hasta con ahora.
function dentroDeVentana24h(waId) {
  try {
    const contactoModel = require('../models/contacto');
    const conversacionModel = require('../models/conversacion');
    const contacto = contactoModel.findByWaId(waId);
    if (!contacto || contacto.deleted === 1) return false;
    const conv = conversacionModel.findByContacto(contacto.id);
    if (!conv || !conv.ventana_24h_hasta) return false;
    return new Date(conv.ventana_24h_hasta + 'Z') > new Date();
  } catch (_) {
    return false;
  }
}

// --- Envia notificacion por WhatsApp personal con boton "Enterado" ---
// templateConfig: { name, lang } opcional para envio fuera de ventana 24h.
async function enviarWhatsApp(numero, mensaje, usuarioId, templateConfig = null) {
  if (!numero) return { ok: false, error: 'Sin numero' };

  const dentro24h = dentroDeVentana24h(numero);

  if (dentro24h) {
    // Dentro de ventana 24h: intentar buttons, luego text.
    try {
      await whatsappService.sendButtons(numero, mensaje, [
        { id: 'enterado_' + usuarioId, title: 'Enterado' },
      ]);
      return { ok: true };
    } catch (e) {
      try {
        await whatsappService.sendText(numero, mensaje);
        return { ok: true };
      } catch (e2) {
        // Buttons y text fallaron, pasar a template abajo.
      }
    }
  }

  // Fuera de ventana 24h (o buttons/text fallaron): usar template.
  if (templateConfig && templateConfig.name) {
    const tmplName = templateConfig.name;
    const tmplLang = templateConfig.lang || 'es_MX';

    // Estrategia 1: variable en body ({{1}} en body)
    try {
      const components = [{ type: 'body', parameters: [{ type: 'text', text: mensaje }] }];
      await whatsappService.sendTemplate(numero, tmplName, tmplLang, components);
      return { ok: true, via: 'template' };
    } catch (eBody) {
      // Estrategia 2: variable en header ({{1}} en header)
      try {
        const components = [{ type: 'header', parameters: [{ type: 'text', text: mensaje }] }];
        await whatsappService.sendTemplate(numero, tmplName, tmplLang, components);
        return { ok: true, via: 'template' };
      } catch (eHeader) {
        // Estrategia 3: sin variables (texto fijo)
        try {
          await whatsappService.sendTemplate(numero, tmplName, tmplLang);
          return { ok: true, via: 'template' };
        } catch (ePlain) {
          return { ok: false, error: ePlain.message };
        }
      }
    }
  }

  return { ok: false, error: dentro24h ? 'Buttons/text/template fallaron' : 'Fuera de ventana 24h y sin template configurado' };
}

// --- Envia notificacion por email con link "Enterado" ---
async function enviarEmail(to, subject, mensaje, globalConfig, usuarioId) {
  if (!to) return { ok: false, error: 'Sin email' };
  if (!globalConfig.smtp_activado) return { ok: false, error: 'SMTP desactivado' };

  // Incluir link para detener notificaciones.
  const url = globalConfig.url_software || '';
  const linkEnterado = url.replace(/\/$/, '') + '/api/notificaciones/enterado/' + usuarioId;
  const mensajeFull = mensaje + '\n\nPara detener estas notificaciones, haz clic aqui: ' + linkEnterado;

  try {
    transporter = nodemailer.createTransport({
      host: globalConfig.smtp_host,
      port: globalConfig.smtp_port || 587,
      auth: { user: globalConfig.smtp_user, pass: globalConfig.smtp_pass },
    });
    await transporter.sendMail({
      from: globalConfig.smtp_from || globalConfig.smtp_user,
      to,
      subject,
      text: mensajeFull,
    });
    return { ok: true };
  } catch (e) {
    transporter = null;
    return { ok: false, error: e.message };
  }
}

// --- Notifica a todos los usuarios activos cuando llega un mensaje ---
async function notificarNuevoMensaje(contactoNombre, mensajeTexto) {
  const globalConfig = notifModel.getGlobalRaw();
  const activos = notifModel.getActivos();
  if (activos.length === 0) return;

  const templateConfig = globalConfig.template_notificacion
    ? { name: globalConfig.template_notificacion, lang: globalConfig.template_notificacion_lang || 'es_MX' }
    : null;

  for (const user of activos) {
    const msg = construirMensaje(user, globalConfig, contactoNombre, mensajeTexto);
    const ctx = `Nuevo mensaje de ${contactoNombre || 'cliente'}`;

    // WhatsApp
    if (user.whatsapp_personal) {
      const r = await enviarWhatsApp(user.whatsapp_personal, msg, user.usuario_id, templateConfig);
      notifModel.logEnvio({
        usuario_id: user.usuario_id, via: 'whatsapp',
        destino: user.whatsapp_personal, mensaje: msg,
        estado: r.ok ? 'ok' : 'error', error: r.error,
      });
      if (r.ok) logger.info(`Notif WA enviada a ${user.username}${r.via === 'template' ? ' (via template)' : ''}`, null, 'sistema', false);
    }

    // Email
    if (user.email) {
      const r = await enviarEmail(user.email, `Notificacion Lykos Chat - ${ctx}`, msg, globalConfig, user.usuario_id);
      notifModel.logEnvio({
        usuario_id: user.usuario_id, via: 'email',
        destino: user.email, mensaje: msg,
        estado: r.ok ? 'ok' : 'error', error: r.error,
      });
      if (r.ok) logger.info(`Notif email enviada a ${user.username}`, null, 'sistema', false);
    }

    // Reactivar recurrencia y marcar ultimo envio
    notifModel.reactivarRecurrencia(user.usuario_id);
    notifModel.setUltimoEnvio(user.usuario_id);
  }
}

// --- Chequea y envia notificaciones recurrentes pendientes ---
async function chequearRecurrencia() {
  const globalConfig = notifModel.getGlobalRaw();
  const pendientes = notifModel.getPendientesRecurrencia();
  if (pendientes.length === 0) return;

  const templateConfig = globalConfig.template_notificacion
    ? { name: globalConfig.template_notificacion, lang: globalConfig.template_notificacion_lang || 'es_MX' }
    : null;

  for (const user of pendientes) {
    const msg = construirMensaje(user, globalConfig);
    if (user.whatsapp_personal) {
      const r = await enviarWhatsApp(user.whatsapp_personal, msg, user.usuario_id, templateConfig);
      notifModel.logEnvio({
        usuario_id: user.usuario_id, via: 'whatsapp',
        destino: user.whatsapp_personal, mensaje: msg,
        estado: r.ok ? 'ok' : 'error', error: r.error,
      });
    }
    if (user.email) {
      const r = await enviarEmail(user.email, 'Recordatorio Lykos Chat', msg, globalConfig, user.usuario_id);
      notifModel.logEnvio({
        usuario_id: user.usuario_id, via: 'email',
        destino: user.email, mensaje: msg,
        estado: r.ok ? 'ok' : 'error', error: r.error,
      });
    }
    notifModel.setUltimoEnvio(user.usuario_id);
  }
}

// --- Detiene la recurrencia cuando el usuario inicia sesion ---
function detenerPorLogin(usuarioId) {
  notifModel.detenerRecurrencia(usuarioId);
  logger.info(`Recurrencia detenida por login de usuario ${usuarioId}`, null, 'sistema', false);
}

module.exports = { notificarNuevoMensaje, chequearRecurrencia, detenerPorLogin };
