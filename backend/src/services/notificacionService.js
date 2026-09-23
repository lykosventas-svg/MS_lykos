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

// --- Envia notificacion por WhatsApp personal con boton "Enterado" ---
async function enviarWhatsApp(numero, mensaje, usuarioId) {
  if (!numero) return { ok: false, error: 'Sin numero' };
  try {
    // Enviar con boton interactivo "Enterado" para detener notificaciones.
    await whatsappService.sendButtons(numero, mensaje, [
      { id: 'enterado_' + usuarioId, title: 'Enterado' },
    ]);
    return { ok: true };
  } catch (e) {
    // Si falla el boton (ej. fuera de ventana 24h), intentar texto plano.
    try {
      await whatsappService.sendText(numero, mensaje);
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: e2.message };
    }
  }
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

  for (const user of activos) {
    const msg = construirMensaje(user, globalConfig, contactoNombre, mensajeTexto);
    const ctx = `Nuevo mensaje de ${contactoNombre || 'cliente'}`;

    // WhatsApp
    if (user.whatsapp_personal) {
      const r = await enviarWhatsApp(user.whatsapp_personal, msg, user.usuario_id);
      notifModel.logEnvio({
        usuario_id: user.usuario_id, via: 'whatsapp',
        destino: user.whatsapp_personal, mensaje: msg,
        estado: r.ok ? 'ok' : 'error', error: r.error,
      });
      if (r.ok) logger.info(`Notif WA enviada a ${user.username}`, null, 'sistema', false);
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

  for (const user of pendientes) {
    const msg = construirMensaje(user, globalConfig);
    if (user.whatsapp_personal) {
      const r = await enviarWhatsApp(user.whatsapp_personal, msg, user.usuario_id);
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
