// ============================================================
//  Servicio: IA generica (cliente OpenAI-compatible)
//  Usa la libreria 'openai' apuntando a baseURL configurable.
//  NO esta acoplado a OpenAI ni a Huawei: cualquier endpoint
//  compatible con el formato OpenAI /v1/chat/completions sirve.
// ============================================================
const OpenAI = require('openai');
const configIaModel = require('../models/configIA');
const configIaConfigModel = require('../models/configIaConfigModel');
const usoIaModel = require('../models/usoIA');
const logger = require('../utils/logger');

// Devuelve la config de IA activa: prioriza multi-config (config_ia_configs),
// si no hay ninguna activa, falla back al singleton (config_ia).
function getActiveConfig() {
  const multi = configIaConfigModel.getActive();
  if (multi && multi.api_key) return { ...multi, ia_enabled: true };
  return configIaModel.getRaw();
}

// Etiqueta que la IA devuelve para escalar a humano.
const ESCALAR_HUMANO_TAG = '[ESCALAR_HUMANO]';

// Instruccion fija inyectada por el sistema (NO editable por el admin).
const INSTRUCCION_FIJA =
  'Si el usuario pide hablar con un asesor o humano, responde unicamente con la etiqueta [ESCALAR_HUMANO] y nada mas.';

// Construye el cliente OpenAI-compatible con la config guardada.
function buildClient(cfg) {
  if (!cfg.base_url) throw new Error('Falta la Base URL de la API de IA. Configurala en el panel.');
  if (!cfg.api_key) throw new Error('Falta la API Key de IA. Configurala en el panel.');
  // La libreria openai acepta baseURL => apunta a cualquier proveedor compatible.
  return new OpenAI({ baseURL: cfg.base_url, apiKey: cfg.api_key });
}

// Devuelve la config activa o null si la IA esta deshabilitada.
function getConfigIfEnabled() {
  const cfg = getActiveConfig();
  if (!cfg.ia_enabled) return null;
  return cfg;
}

// --- Probar conexion IA: envia un mensaje simple ---
async function testConnection() {
  let cfg, client;
  try {
    cfg = getActiveConfig();
    client = buildClient(cfg);
  } catch (e) {
    configIaModel.setCheckResult(`Error: ${e.message}`);
    return { ok: false, mensaje: e.message, detalle: null };
  }

  try {
    const resp = await client.chat.completions.create({
      model: cfg.model_name || 'glm-5.2',
      messages: [
        { role: 'system', content: 'Eres un asistente de prueba. Responde breve.' },
        { role: 'user', content: 'Responde unicamente: "Conexion IA correcta".' },
      ],
      temperature: 0.2,
      max_tokens: 50,
    }, { timeout: 20000 });

    const text = resp.choices?.[0]?.message?.content || '(sin contenido)';
    const mensaje = `Conexion IA correcta. Modelo: ${cfg.model_name}. Respuesta de prueba: "${text}".`;
    configIaModel.setCheckResult(mensaje);
    logger.info('Prueba conexion IA OK', { model: cfg.model_name }, 'ia');
    return { ok: true, mensaje, detalle: { model: cfg.model_name, respuesta: text, usage: resp.usage } };
  } catch (err) {
    const msg = interpretarErrorIA(err);
    configIaModel.setCheckResult(msg);
    logger.error('Prueba conexion IA fallo', { status: err.status, msg: err.message }, 'ia');
    return { ok: false, mensaje: msg, detalle: null };
  }
}

// --- Generar respuesta IA con historial + system prompt ---
// historial: [{ role: 'user'|'assistant', content }] (ultimos N mensajes)
// conversacionId, contactoId: para registrar uso
// Devuelve { text, escalarHumano, usage, error }
async function generateResponse(historial, { conversacionId, contactoId } = {}) {
  let cfg, client;
  try {
    cfg = getActiveConfig();
    client = buildClient(cfg);
  } catch (e) {
    return { text: null, escalarHumano: false, usage: null, error: e.message };
  }

  // System prompt = contexto del negocio + instruccion fija inyectada.
  const systemContent = [
    cfg.system_prompt || '',
    INSTRUCCION_FIJA,
  ].filter(Boolean).join('\n\n');

  const messages = [
    { role: 'system', content: systemContent },
    ...historial.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const resp = await client.chat.completions.create({
      model: cfg.model_name || 'glm-5.2',
      messages,
      temperature: cfg.temperature ?? 0.4,
      max_tokens: cfg.max_tokens ?? 300,
    }, { timeout: 30000 });

    const text = resp.choices?.[0]?.message?.content || '';
    const usage = resp.usage || null;

    // Registrar uso de tokens.
    if (usage && (conversacionId || contactoId)) {
      usoIaModel.registrar({
        conversacion_id: conversacionId || null,
        contacto_id: contactoId || null,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        modelo: cfg.model_name,
        estado: 'ok',
      });
    }

    // Detectar etiqueta de escalado a humano.
    const escalarHumano = text.trim().toUpperCase().includes(ESCALAR_HUMANO_TAG);
    const cleanText = escalarHumano ? '' : text.trim();

    return { text: cleanText, escalarHumano, usage, error: null };
  } catch (err) {
    const msg = interpretarErrorIA(err);
    logger.error('Error al generar respuesta IA', { msg, conversacionId }, 'ia');
    // Registrar error de uso.
    if (conversacionId || contactoId) {
      usoIaModel.registrar({
        conversacion_id: conversacionId || null,
        contacto_id: contactoId || null,
        prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
        modelo: cfg.model_name, estado: 'error', error: msg,
      });
    }
    return { text: null, escalarHumano: false, usage: null, error: msg };
  }
}

// --- Traduce errores de la API de IA a texto legible ---
function interpretarErrorIA(err) {
  const status = err.status || err.response?.status;
  const msg = err.message || '';
  if (status === 401) return 'API Key invalida o no autorizada (HTTP 401). Revisa la clave en el panel.';
  if (status === 403) return `Acceso denegado (HTTP 403). ${msg}`.trim();
  if (status === 404) return `Endpoint o modelo no encontrado (HTTP 404). Revisa la Base URL y el nombre del modelo. ${msg}`.trim();
  if (status === 429) return 'Demasiadas solicitudes a la IA (rate limit). Espera e intenta de nuevo.';
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')) {
    return 'Tiempo de espera agotado al contactar la IA.';
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return 'No se pudo conectar a la Base URL de la IA. Revisa la URL en el panel.';
  }
  return `Error de IA: ${msg}`;
}

// --- Probar conexion IA para una config especifica (multi-config) ---
async function testConnectionById(id) {
  let cfg, client;
  try {
    cfg = configIaConfigModel.getRaw(id);
    if (!cfg) return { ok: false, mensaje: 'Configuracion no encontrada.', detalle: null };
    client = buildClient(cfg);
  } catch (e) {
    configIaConfigModel.setCheckResult(id, `Error: ${e.message}`);
    return { ok: false, mensaje: e.message, detalle: null };
  }

  try {
    const resp = await client.chat.completions.create({
      model: cfg.model_name || 'glm-5.2',
      messages: [
        { role: 'system', content: 'Eres un asistente de prueba. Responde breve.' },
        { role: 'user', content: 'Responde unicamente: "Conexion IA correcta".' },
      ],
      temperature: 0.2,
      max_tokens: 50,
    }, { timeout: 20000 });

    const text = resp.choices?.[0]?.message?.content || '(sin contenido)';
    const mensaje = `Conexion IA correcta. Modelo: ${cfg.model_name}. Respuesta de prueba: "${text}".`;
    configIaConfigModel.setCheckResult(id, mensaje);
    logger.info('Prueba conexion IA OK (multi-config)', { id, model: cfg.model_name }, 'ia');
    return { ok: true, mensaje, detalle: { model: cfg.model_name, respuesta: text, usage: resp.usage } };
  } catch (err) {
    const msg = interpretarErrorIA(err);
    configIaConfigModel.setCheckResult(id, msg);
    logger.error('Prueba conexion IA fallo (multi-config)', { id, status: err.status, msg: err.message }, 'ia');
    return { ok: false, mensaje: msg, detalle: null };
  }
}

module.exports = {
  ESCALAR_HUMANO_TAG,
  INSTRUCCION_FIJA,
  getActiveConfig,
  getConfigIfEnabled,
  testConnection,
  testConnectionById,
  generateResponse,
  interpretarErrorIA,
};
