// ============================================================
//  Servicio: WhatsApp Cloud API (Meta Graph API)
//  - testConnection: GET /{phone_number_id}
//  - sendMessage: POST /{phone_number_id}/messages
//  - sendText, sendInteractive (helpers)
//  Considera la ventana de 24h en todo envio.
// ============================================================
const axios = require('axios');
const configWaModel = require('../models/configWhatsApp');
const logger = require('../utils/logger');

// Base URL del Graph API.
function graphBase(version) {
  return `https://graph.facebook.com/${version || 'v19.0'}`;
}

// Devuelve las credenciales listas para usar (lanza si faltan).
function getCredentials() {
  const cfg = configWaModel.getRaw();
  if (!cfg.phone_number_id) throw new Error('Falta Phone Number ID. Configuralo en el panel.');
  if (!cfg.access_token) throw new Error('Falta el token de acceso. Configuralo en el panel.');
  return {
    phoneNumberId: cfg.phone_number_id,
    token: cfg.access_token,
    version: cfg.graph_api_version || 'v19.0',
  };
}

// --- Probar conexion: GET /{phone_number_id} ---
// Devuelve { ok, mensaje, detalle }
async function testConnection() {
  let creds;
  try {
    creds = getCredentials();
  } catch (e) {
    return { ok: false, mensaje: e.message, detalle: null };
  }

  try {
    const url = `${graphBase(creds.version)}/${creds.phoneNumberId}`;
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${creds.token}` },
      timeout: 15000,
    });
    const data = resp.data;
    // Meta devuelve: { verified_name, code_verification_state, display_phone_number, ... }
    const mensaje = `Conexion correcta. Numero: ${data.display_phone_number || '?'} | Nombre verificado: ${data.verified_name || '?'} | Estado: ${data.code_verification_state || '?'}.`;
    configWaModel.setCheckResult({ token_valid: true, token_expires_at: null, result: mensaje });
    logger.info('Prueba conexion WhatsApp OK', { data }, 'whatsapp');
    return { ok: true, mensaje, detalle: data };
  } catch (err) {
    const msg = interpretarErrorMeta(err);
    configWaModel.setCheckResult({ token_valid: false, token_expires_at: null, result: msg });
    logger.error('Prueba conexion WhatsApp fallo', { status: err.response?.status, data: err.response?.data }, 'whatsapp');
    return { ok: false, mensaje: msg, detalle: err.response?.data || null };
  }
}

// --- Enviar mensaje generico (POST /{phone_number_id}/messages) ---
async function sendMessage(payload) {
  const creds = getCredentials();
  const url = `${graphBase(creds.version)}/${creds.phoneNumberId}/messages`;
  const resp = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  return resp.data; // { messages: [{ id }], ... }
}

// --- Helpers de envio (respetan ventana 24h: solo messaging_product text/interactive) ---

// Envia un texto simple.
// contextWamId (opcional): wam_id del mensaje que se cita (reply). Meta lo muestra como quote.
async function sendText(toWaId, text, contextWamId) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId,
    type: 'text',
    text: { body: text, preview_url: false },
  };
  if (contextWamId) {
    payload.context = { message_id: contextWamId };
  }
  return sendMessage(payload);
}

// Envia botones interactivos (hasta 3 botones).
async function sendButtons(toWaId, bodyText, buttons) {
  // buttons: [{ id, title }]
  const formatted = buttons.slice(0, 3).map(b => ({
    type: 'reply',
    reply: { id: b.id, title: b.title.slice(0, 20) },
  }));
  return sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: formatted },
    },
  });
}

// Envia un menu de lista (para menus con mas de 3 opciones).
async function sendList(toWaId, bodyText, buttonLabel, rows) {
  // rows: [{ id, title, description }]
  return sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [{ title: 'Opciones', rows: rows.slice(0, 10).map(r => ({
          id: r.id, title: r.title.slice(0, 24),
          description: (r.description || '').slice(0, 72),
        })) }],
      },
    },
  });
}

// Envia una plantilla (para reabrir fuera de ventana 24h).
async function sendTemplate(toWaId, templateName, languageCode = 'es_MX') {
  return sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId,
    type: 'template',
    template: { name: templateName, language: { code: languageCode } },
  });
}

// Sube un archivo a Meta y lo envia como documento o imagen.
// filePath: ruta absoluta al archivo en disco.
// filename: nombre original del archivo.
// mimetype: tipo MIME del archivo.
// caption: texto acompanante (opcional).
// contextWamId (opcional): wam_id del mensaje citado (reply).
async function sendMedia(toWaId, filePath, filename, mimetype, caption, contextWamId) {
  const creds = getCredentials();
  const fs = require('fs');
  const FormData = require('form-data');

  // 1. Subir el archivo a Meta.
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', fs.createReadStream(filePath), { filename, contentType: mimetype });

  const uploadUrl = `${graphBase(creds.version)}/${creds.phoneNumberId}/media`;
  const uploadResp = await axios.post(uploadUrl, form, {
    headers: { Authorization: `Bearer ${creds.token}`, ...form.getHeaders() },
    timeout: 30000,
  });
  const mediaId = uploadResp.data.id;
  if (!mediaId) throw new Error('No se pudo subir el archivo a Meta.');

  // 2. Enviar el mensaje con el media ID.
  // Meta solo acepta audio en formatos: OGG (opus), AAC, MP4, MP3, AMR.
  // WebM (producido por Chrome) NO es valido como audio → se envia como document.
  const isImage = mimetype && mimetype.startsWith('image/');
  const isMetaAudio = mimetype && (
    mimetype.startsWith('audio/ogg') ||
    mimetype.startsWith('audio/aac') ||
    mimetype.startsWith('audio/mp4') ||
    mimetype.startsWith('audio/mpeg') ||
    mimetype.startsWith('audio/amr')
  );
  const isVideo = mimetype && mimetype.startsWith('video/');
  const type = isImage ? 'image' : isMetaAudio ? 'audio' : isVideo ? 'video' : 'document';
  const mediaObj = isImage
    ? { id: mediaId, caption: caption || undefined }
    : isMetaAudio
    ? { id: mediaId }
    : isVideo
    ? { id: mediaId, caption: caption || undefined }
    : { id: mediaId, filename: filename, caption: caption || undefined };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId,
    type,
    [type]: mediaObj,
  };
  if (contextWamId) {
    payload.context = { message_id: contextWamId };
  }
  return sendMessage(payload);
}

// --- Traduce errores de la API de Meta a texto legible ---
function interpretarErrorMeta(err) {
  const status = err.response?.status;
  const data = err.response?.data;
  const fbError = data?.error;
  if (status === 401 || status === 403) {
    return `Token invalido o sin permisos (HTTP ${status}). ${fbError?.message || ''}`.trim();
  }
  if (status === 404) {
    return `No encontrado (HTTP 404). Revisa el Phone Number ID y la version de la Graph API. ${fbError?.message || ''}`.trim();
  }
  if (status === 429) {
    return `Demasiadas solicitudes (rate limit de Meta). Espera e intenta de nuevo.`;
  }
  if (fbError) {
    return `Error de Meta (codigo ${fbError.code || '?'}): ${fbError.message || 'desconocido'}`;
  }
  if (err.code === 'ECONNABORTED') return 'Tiempo de espera agotado al contactar Meta.';
  return `Error de conexion: ${err.message}`;
}

module.exports = {
  testConnection,
  sendMessage,
  sendText,
  sendButtons,
  sendList,
  sendTemplate,
  sendMedia,
  getCredentials,
  interpretarErrorMeta,
};
