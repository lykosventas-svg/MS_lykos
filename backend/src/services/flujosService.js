// ============================================================
//  Servicio: Flujos del BOT (Módulo 4 - modo sin IA)
//  Soporta: flujos_bot (CRUD nuevo) + config_bot (legacy)
// ============================================================
const configBotModel = require('../models/configBot');
const flujoBotModel = require('../models/flujoBot');
const conversacionModel = require('../models/conversacion');
const mensajeModel = require('../models/mensaje');
const logger = require('../utils/logger');

const PALABRAS_ASESOR = ['asesor', 'humano', 'agente', 'persona', 'operador', 'tu humano', 'hablar con alguien'];

function normalizar(texto) {
  return (texto || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- Punto de entrada ---
function procesarMensaje(ctx) {
  const { conversacion, mensaje } = ctx;
  const textoEntrada = normalizar(mensaje.texto);
  const contenido = mensaje.contenido || {};

  // 1. Detectar peticion de asesor/humano (aplica siempre).
  if (PALABRAS_ASESOR.some(p => textoEntrada.includes(p))) {
    return { coincidencia: true, escalarHumano: true, tipo: 'text', texto: null, buttons: null };
  }

  // 2. Verificar si hay un flujo nuevo activo (tabla flujos_bot).
  const flujoActivo = flujoBotModel.getActive();
  if (flujoActivo && flujoActivo.flujo && flujoActivo.flujo.nodos) {
    return procesarFlujoNuevo(flujoActivo.flujo, ctx, textoEntrada, contenido);
  }

  // 3. Flujo legacy (config_bot).
  const cfg = configBotModel.getConfig();
  if (!cfg.activo) return { coincidencia: false, escalarHumano: false, tipo: 'text', texto: null, buttons: null };

  // 4. Respuesta interactiva -> seguir arbol legacy.
  if (mensaje.tipo === 'interactive' || mensaje.tipo === 'button') {
    const btnId = contenido.id || '';
    const resultado = resolverNodoArbol(cfg, btnId, conversacion);
    if (resultado) return resultado;
  }

  // 5. Palabras clave.
  const matchKw = buscarPalabraClave(cfg.palabras_clave, textoEntrada);
  if (matchKw) {
    return { coincidencia: true, escalarHumano: false, tipo: 'text', texto: matchKw, buttons: null };
  }

  // 6. Comandos especiales.
  if (['menu', 'inicio', 'ayuda', 'opciones', 'empezar'].includes(textoEntrada)) {
    return construirMenuBienvenida(cfg);
  }

  // 7. Primer mensaje -> bienvenida.
  const historial = mensajeModel.listByConversacion(conversacion.id, 2);
  if (historial.length <= 1) {
    return construirMenuBienvenida(cfg);
  }

  return { coincidencia: false, escalarHumano: false, tipo: 'text', texto: null, buttons: null };
}

// --- Procesa mensaje con el nuevo sistema de flujos (flujos_bot) ---
function procesarFlujoNuevo(flujo, ctx, textoEntrada, contenido) {
  const { conversacion, mensaje } = ctx;
  const nodos = flujo.nodos || [];

  if (mensaje.tipo === 'interactive' || mensaje.tipo === 'button') {
    const btnId = contenido.id || '';
    if (btnId === 'menu_principal' || btnId === 'inicio') {
      return construirBienvenidaFlujo(flujo);
    }
    const btn = buscarBotonEnArbol(nodos, btnId);
    if (btn) {
      if (btn.escalar_humano) {
        return { coincidencia: true, escalarHumano: true, tipo: 'text', texto: null, buttons: null };
      }
      const respuesta = btn.respuesta || 'Selecciona una opcion.';
      const subbotones = btn.subbotones || [];
      if (subbotones.length > 0) {
        conversacionModel.setPasoFlujo(conversacion.id, btnId);
        return {
          coincidencia: true, escalarHumano: false,
          tipo: 'buttons', texto: respuesta,
          buttons: subbotones.map(b => ({ id: b.id, title: b.texto || b.title || '' })),
        };
      }
      // Leaf node: flujo completado.
      return {
        coincidencia: true, escalarHumano: false, flujoCompletado: true,
        tipo: 'text', texto: respuesta,
        buttons: null,
      };
    }
  }

  if (['menu', 'inicio', 'ayuda', 'opciones', 'empezar'].includes(textoEntrada)) {
    return construirBienvenidaFlujo(flujo);
  }

  const historial = mensajeModel.listByConversacion(conversacion.id, 2);
  if (historial.length <= 1) {
    return construirBienvenidaFlujo(flujo);
  }

  // 4. Texto despues de la primera interaccion -> fallback del flujo.
  return {
    coincidencia: true, escalarHumano: false,
    tipo: 'buttons',
    texto: flujo.mensaje_fallback || 'No entendi. Selecciona una opcion o escribe "asesor".',
    buttons: [{ id: 'menu_principal', title: 'Ver opciones' }, { id: 'pedir_asesor', title: 'Hablar con asesor' }],
  };
}

// --- Busca un boton por id en el arbol (hasta 3 niveles) ---
function buscarBotonEnArbol(nodos, btnId) {
  for (const nodo of nodos) {
    for (const btn of (nodo.botones || [])) {
      if (btn.id === btnId) return btn;
      for (const sb of (btn.subbotones || [])) {
        if (sb.id === btnId) return sb;
        for (const sb2 of (sb.subbotones || [])) {
          if (sb2.id === btnId) return sb2;
        }
      }
    }
  }
  return null;
}

// --- Construye la bienvenida del flujo nuevo ---
function construirBienvenidaFlujo(flujo) {
  const nodos = flujo.nodos || [];
  const primerNodo = nodos[0];
  if (!primerNodo || !primerNodo.mensaje) {
    return { coincidencia: true, escalarHumano: false, tipo: 'text', texto: 'Hola! Como podemos ayudarte?', buttons: null };
  }
  const buttons = (primerNodo.botones || []).map(b => ({ id: b.id, title: b.texto || b.title || '' }));
  return {
    coincidencia: true, escalarHumano: false,
    tipo: buttons.length > 0 ? 'buttons' : 'text',
    texto: primerNodo.mensaje,
    buttons: buttons.length > 0 ? buttons : null,
  };
}

// --- Resuelve un nodo del arbol legacy por id de boton ---
function resolverNodoArbol(cfg, btnId, conversacion) {
  const arbol = cfg.arbol_conversacion || {};
  const nodo = arbol[btnId];

  if (btnId === 'menu_principal' || btnId === 'inicio') {
    return construirMenuBienvenida(cfg);
  }

  if (!nodo) return null;

  if (nodo.respuesta) {
    if (nodo.submenu && nodo.submenu.length > 0) {
      conversacionModel.setPasoFlujo(conversacion.id, btnId);
      return {
        coincidencia: true, escalarHumano: false,
        tipo: 'buttons', texto: nodo.respuesta,
        buttons: nodo.submenu.map(b => ({ id: b.id, title: b.title })),
      };
    }
    return {
      coincidencia: true, escalarHumano: false,
      tipo: 'buttons', texto: nodo.respuesta,
      buttons: [{ id: 'menu_principal', title: 'Menu principal' }],
    };
  }

  return null;
}

function buscarPalabraClave(palabrasClave, texto) {
  if (!Array.isArray(palabrasClave)) return null;
  for (const kw of palabrasClave) {
    const palabra = normalizar(kw.palabra || kw.keyword || '');
    if (palabra && texto.includes(palabra)) {
      return kw.respuesta || kw.response || null;
    }
  }
  return null;
}

function construirMenuBienvenida(cfg) {
  const menu = cfg.menu_definicion || {};
  const buttons = (menu.buttons || []).map(b => ({ id: b.id, title: b.title }));
  return {
    coincidencia: true, escalarHumano: false,
    tipo: buttons.length > 0 ? 'buttons' : 'text',
    texto: cfg.mensaje_bienvenida || 'Hola! Como podemos ayudarte?',
    buttons: buttons.length > 0 ? buttons : null,
  };
}

function construirFallback(cfg) {
  return {
    tipo: 'buttons',
    texto: (cfg && cfg.mensaje_fallback) || 'No entendi lo que dijiste. Elige una opcion o escribe "asesor".',
    buttons: [
      { id: 'menu_principal', title: 'Ver opciones' },
      { id: 'pedir_asesor', title: 'Hablar con asesor' },
    ],
  };
}

// --- Construye la bienvenida del flujo activo (para inicio de conversacion) ---
function construirBienvenida() {
  const flujoActivo = flujoBotModel.getActive();
  if (flujoActivo && flujoActivo.flujo && flujoActivo.flujo.nodos) {
    return construirBienvenidaFlujo(flujoActivo.flujo);
  }
  const cfg = configBotModel.getConfig();
  if (cfg.activo) {
    return construirMenuBienvenida(cfg);
  }
  return null;
}

module.exports = { procesarMensaje, construirFallback, construirMenuBienvenida, construirBienvenida, normalizar, PALABRAS_ASESOR };
