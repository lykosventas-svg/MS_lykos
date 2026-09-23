// ============================================================
//  Helper de API: fetch con auth JWT automatico
// ============================================================
window.api = (function () {
  const TOKEN_KEY = 'lykos_token';
  const USER_KEY = 'lykos_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (_) { return null; } }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    const newToken = resp.headers.get('X-New-Token');
    if (newToken) setToken(newToken);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 401 && data.code === 'SESSION_REPLACED') {
        clear();
        window.dispatchEvent(new CustomEvent('session-replaced'));
      }
      throw new Error(data.error || ('HTTP ' + resp.status));
    }
    return data;
  }

  return {
    getToken, setToken, getUser, setUser, clear,
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b),
    put: (u, b) => request('PUT', u, b),
    del: (u) => request('DELETE', u),
    // --- Auth ---
    login: (username, password) => request('POST', '/api/auth/login', { username, password }),
    logout: () => request('POST', '/api/auth/logout'),
    profile: () => request('GET', '/api/auth/profile'),
    // --- Config WhatsApp ---
    getWa: () => request('GET', '/api/config/whatsapp'),
    saveWa: (b) => request('PUT', '/api/config/whatsapp', b),
    testWa: () => request('POST', '/api/config/whatsapp/test'),
    regenVerify: () => request('POST', '/api/config/whatsapp/regenerate-verify-token'),
    // --- Config IA (singleton legacy) ---
    getIa: () => request('GET', '/api/config/ia'),
    saveIa: (b) => request('PUT', '/api/config/ia', b),
    testIa: () => request('POST', '/api/config/ia/test'),
    // --- IA Configs (CRUD multi-config) ---
    getIaConfigs: () => request('GET', '/api/ia-configs'),
    createIaConfig: (b) => request('POST', '/api/ia-configs', b),
    updateIaConfig: (id, b) => request('PUT', '/api/ia-configs/' + id, b),
    deleteIaConfig: (id) => request('DELETE', '/api/ia-configs/' + id),
    activateIaConfig: (id) => request('PUT', '/api/ia-configs/' + id + '/activate'),
    deactivateAllIaConfigs: () => request('PUT', '/api/ia-configs/deactivate-all'),
    testIaConfig: (id) => request('POST', '/api/ia-configs/' + id + '/test'),
    // --- Mensajes Masivos ---
    getMasivos: () => request('GET', '/api/mensajes-masivos'),
    createMasivo: (b) => request('POST', '/api/mensajes-masivos', b),
    updateMasivo: (id, b) => request('PUT', '/api/mensajes-masivos/' + id, b),
    deleteMasivo: (id) => request('DELETE', '/api/mensajes-masivos/' + id),
    enviarMasivo: (id) => request('POST', '/api/mensajes-masivos/' + id + '/enviar'),
    checkVentana: (b) => request('POST', '/api/mensajes-masivos/check-ventana', b),
    // --- Flujos Bot (CRUD) ---
    getFlujosBot: () => request('GET', '/api/flujos-bot'),
    createFlujoBot: (b) => request('POST', '/api/flujos-bot', b),
    updateFlujoBot: (id, b) => request('PUT', '/api/flujos-bot/' + id, b),
    deleteFlujoBot: (id) => request('DELETE', '/api/flujos-bot/' + id),
    activateFlujoBot: (id) => request('PUT', '/api/flujos-bot/' + id + '/activate'),
    deactivateAllFlujosBot: () => request('PUT', '/api/flujos-bot/deactivate-all'),
    uploadDocFlujoBot: (b) => request('POST', '/api/flujos-bot/upload-doc', b),
    // --- Config Bot (legacy) ---
    getBot: () => request('GET', '/api/config/bot'),
    saveBot: (b) => request('PUT', '/api/config/bot', b),
    // --- Conversaciones ---
    getConvs: (params) => request('GET', '/api/conversaciones' + (params ? '?' + new URLSearchParams(params) : '')),
    getConv: (id) => request('GET', '/api/conversaciones/' + id),
    setConvModo: (id, modo) => request('PUT', '/api/conversaciones/' + id + '/modo', { modo }),
    tomarConv: (id) => request('POST', '/api/conversaciones/' + id + '/tomar'),
    soltarConv: (id) => request('POST', '/api/conversaciones/' + id + '/soltar'),
    toggleIaConv: (id) => request('POST', '/api/conversaciones/' + id + '/toggle-ia'),
    sendManual: (id, text, replyTo) => request('POST', '/api/conversaciones/' + id + '/mensajes', { text, reply_to: replyTo || null }),
    sendChatMedia: (id, b) => request('POST', '/api/conversaciones/' + id + '/media', b),
    sendTemplate: (id, template_name, language) => request('POST', '/api/conversaciones/' + id + '/template', { template_name, language }),
    forwardMessages: (id, messageIds, targetContactoIds) => request('POST', '/api/conversaciones/' + id + '/forward', { message_ids: messageIds, target_contacto_ids: targetContactoIds }),
    deleteConv: (id) => request('DELETE', '/api/conversaciones/' + id),
    // --- Contactos ---
    getContactos: (search) => request('GET', '/api/contactos' + (search ? '?search=' + encodeURIComponent(search) : '')),
    getContacto: (id) => request('GET', '/api/contactos/' + id),
    updateContacto: (id, b) => request('PUT', '/api/contactos/' + id, b),
    deleteContacto: (id) => request('DELETE', '/api/contactos/' + id),
    restoreContacto: (id) => request('POST', '/api/contactos/' + id + '/restore'),
    // --- Metricas ---
    getMetricas: () => request('GET', '/api/metricas'),
    // --- Usuarios ---
    getUsuarios: () => request('GET', '/api/usuarios'),
    createUsuario: (b) => request('POST', '/api/usuarios', b),
    updateUsuarioPassword: (id, password) => request('PUT', '/api/usuarios/' + id + '/password', { password }),
    setUsuarioActivo: (id, activo) => request('PUT', '/api/usuarios/' + id + '/activo', { activo }),
    updateUsuario: (id, b) => request('PUT', '/api/usuarios/' + id, b),
    deleteUsuario: (id) => request('DELETE', '/api/usuarios/' + id),
    // --- Notificaciones ---
    getNotifGlobal: () => request('GET', '/api/notificaciones/global'),
    saveNotifGlobal: (b) => request('PUT', '/api/notificaciones/global', b),
    getNotifUsuarios: () => request('GET', '/api/notificaciones/usuarios'),
    saveNotifUsuario: (id, b) => request('PUT', '/api/notificaciones/usuarios/' + id, b),
    getNotifLog: () => request('GET', '/api/notificaciones/log'),
  };
})();
