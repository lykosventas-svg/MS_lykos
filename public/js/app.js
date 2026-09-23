// ============================================================
//  Alpine.js: componente principal del panel
// ============================================================
function app() {
  return {
    view: 'login',
    user: null,
    tab: 'inicio',
    subtab: null,
    notifExpanded: false,
    sidebarOpen: false,
    toast: '',

    // Modal de confirmacion reutilizable
    confirmModal: { open: false, title: 'Confirmar', message: '', onConfirm: null },

    // Estado de tablas (sort, filter, pagination)
    tblContactos: { sortCol: 'updated_at', sortDir: 'desc', filters: {}, page: 1, perPage: 10 },
    tblUsuarios: { sortCol: null, sortDir: 'asc', filters: {}, page: 1, perPage: 10 },
    tblNotifUsuarios: { sortCol: null, sortDir: 'asc', filters: {}, page: 1, perPage: 10 },
    tblNotifLog: { sortCol: 'created_at', sortDir: 'desc', filters: {}, page: 1, perPage: 10 },

    // Login
    loginForm: { username: '', password: '' },
    loginLoading: false,
    loginError: '',
    showLoginPass: false,

    // WhatsApp
    wa: {},
    showWaToken: false,
    showAppSecret: false,
    waSaving: false, waTesting: false,
    waMsg: '', waMsgOk: false,

    // IA (singleton legacy - still used for fallback)
    ia: { ia_enabled: false, ia_mode: 'respaldo', temperature: 0.4, max_tokens: 300, max_messages_per_day: 50 },
    showIaKey: false,
    iaSaving: false, iaTesting: false,
    iaMsg: '', iaMsgOk: false,

    // IA Configs (CRUD multi-config)
    iaConfigs: [],
    iaConfigEdit: null,
    iaConfigForm: { nombre: '', descripcion: '', ia_mode: 'respaldo', base_url: '', api_key: '', model_name: 'glm-5.2', temperature: 0.4, max_tokens: 300, system_prompt: '', max_messages_per_day: 50, activo: false },
    iaConfigSaving: false,
    iaConfigTesting: false,
    iaConfigMsg: '', iaConfigMsgOk: false,
    showIaConfigKey: false,
    iaConfigModalOpen: false,

    // Bot (legacy)
    bot: {},
    modoInicioPrev: null,
    botSaving: false,
    botMsg: '', botMsgOk: false,

    // Flujos Bot (CRUD)
    flujosBot: [],
    flujoBotEdit: null,
    flujoBotModalOpen: false,
    flujoBotForm: { nombre: '', descripcion: '', flujo: { mensaje_bienvenida: '', mensaje_fallback: '', mensaje_escalamiento: '', mensaje_escalamiento_activo: false, niveles: 3, nodos: [] } },
    flujoBotSaving: false,
    flujoBotMsg: '', flujoBotMsgOk: false,
    botWarningModal: false,

    // Agentes (bandeja + chat)
    convs: [],
    convFilter: '',
    selectedConvId: null,
    selectedConv: null,
    manualMsg: '',
    templateName: '',
    ventanaExpirada: false,
    socket: null,
    chatMenuOpen: false,
    chatFilePending: [],
    chatFilePreviewUrls: [],
    chatFileIndex: 0,

    // Reply / Forward
    replyToMsg: null,
    msgContextMenu: { open: false, messageId: null, x: 0, y: 0 },
    forwardModal: { open: false, messages: [], contactos: [], selectedContactos: [], search: '', sending: false, result: null },
    swipeState: { msgId: null, startX: 0, currentX: 0, active: false },

    // Contactos
    contactos: [],
    contactoSearch: '',
    contactoEdit: null,
    contactoEditName: '',
    contactoEditTags: '',
    contactoEditNotas: '',

    // Metricas
    metricas: {},

    // Usuarios
    usuarios: [],
    newUser: { username: '', nombre: '', password: '', role: 'agente' },
    userEdit: null,
    userEditForm: { username: '', nombre: '', role: 'agente', password: '' },
    userMenuOpen: null,
    userCreateOpen: false,
    showCreatePass: false,
    showEditPass: false,

    // Notificaciones
    notifGlobal: { smtp_activado: false, smtp_port: 587 },
    notifUsuarios: [],
    notifLog: [],
    notifSaving: false,

    // Mensajes Masivos
    masivos: [],
    masivoEdit: null,
    masivoModalOpen: false,
    masivoForm: { nombre: '', mensaje: '', contactos: [], enviar_a_todos: false, template_name: '', language: 'en_US', archivo_adjunto: null },
    masivoSaving: false,
    masivoEnviando: false,
    masivoContactos: [],
    masivoSearch: '',
    masivoSelectAll: false,
    masivoVentana: { dentro_24h: 0, fuera_24h: 0, total: 0, contactos: [] },
    masivoCheckingVentana: false,
    masivoContactosExpanded: false,

    // ---------- Init ----------
    async init() {
      const token = api.getToken();
      if (token) {
        try {
          this.user = await api.profile();
          this.view = 'panel';
          this.tab = 'inicio';
          this.connectSocket();
        } catch (_) { api.clear(); this.view = 'login'; }
      }
      window.addEventListener('session-replaced', () => {
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.view = 'login';
        this.loginError = 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.';
      });
    },

    // Socket.io para mensajes en tiempo real
    connectSocket() {
      if (this.socket) return;
      try {
        this.socket = io({ auth: { token: api.getToken() } });
        this.socket.on('mensaje_recibido', (data) => {
          if (this.tab === 'agentes') this.loadConvs();
          if (this.selectedConvId && Number(this.selectedConvId) === Number(data.conversacion_id)) {
            this.selectConv(data.conversacion_id);
          }
          this.showToast('Nuevo mensaje de ' + (data.contacto?.nombre || data.contacto?.wa_id));
        });
        this.socket.on('mensaje_enviado', (data) => {
          if (this.tab === 'agentes') this.loadConvs();
          if (this.selectedConvId && Number(this.selectedConvId) === Number(data.conversacion_id)) {
            this.selectConv(data.conversacion_id);
          }
        });
        this.socket.on('handoff_solicitado', (data) => {
          this.showToast('Handoff solicitado: ' + (data.contacto?.nombre || data.contacto?.wa_id));
          if (this.tab === 'agentes') this.loadConvs();
          if (this.selectedConvId && Number(this.selectedConvId) === Number(data.conversacion_id)) {
            this.selectConv(data.conversacion_id);
          }
        });
        this.socket.on('conv_tomada', (data) => {
          if (this.tab === 'agentes') this.loadConvs();
          if (this.selectedConvId && Number(this.selectedConvId) === Number(data.conversacion_id)) {
            this.selectConv(data.conversacion_id);
            if (data.agente_id !== this.user.id) {
              this.showToast('Conversación tomada por ' + (data.agente_nombre || 'otro agente'));
            }
          }
        });
        this.socket.on('conv_soltada', (data) => {
          if (this.tab === 'agentes') this.loadConvs();
          if (this.selectedConvId && Number(this.selectedConvId) === Number(data.conversacion_id)) {
            this.selectConv(data.conversacion_id);
          }
        });
        this.socket.on('force_logout', () => {
          this.socket = null;
          api.clear();
          this.view = 'login';
          this.loginError = 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.';
        });
      } catch (_) {}
    },

    showToast(msg) { this.toast = msg; setTimeout(() => this.toast = '', 3000); },

    showConfirm(message, onConfirm, title = 'Confirmar accion') {
      this.confirmModal = { open: true, title, message, onConfirm };
    },
    confirmYes() {
      const cb = this.confirmModal.onConfirm;
      this.confirmModal = { open: false, title: 'Confirmar', message: '', onConfirm: null };
      if (cb) cb();
    },
    confirmCancel() {
      this.confirmModal = { open: false, title: 'Confirmar', message: '', onConfirm: null };
    },

    // ---------- Helpers de tabla (sort, filter, paginate) ----------
    tblSort(stateName, col) {
      const s = this[stateName];
      if (s.sortCol === col) { s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { s.sortCol = col; s.sortDir = 'asc'; }
      s.page = 1;
    },
    tblFilter(stateName, col, val) {
      const s = this[stateName];
      s.filters[col] = val;
      s.page = 1;
    },
    tblData(stateName, allRows) {
      const s = this[stateName];
      let data = [...allRows];
      for (const [col, val] of Object.entries(s.filters)) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          data = data.filter(row => String(row[col] ?? '').toLowerCase().includes(String(val).toLowerCase()));
        }
      }
      if (s.sortCol) {
        data.sort((a, b) => {
          let av = a[s.sortCol] ?? '', bv = b[s.sortCol] ?? '';
          if (typeof av === 'string') av = av.toLowerCase();
          if (typeof bv === 'string') bv = bv.toLowerCase();
          if (av < bv) return s.sortDir === 'asc' ? -1 : 1;
          if (av > bv) return s.sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      const total = data.length;
      const totalPages = Math.max(1, Math.ceil(total / s.perPage));
      if (s.page > totalPages) s.page = totalPages;
      const start = (s.page - 1) * s.perPage;
      return { rows: data.slice(start, start + s.perPage), total, totalPages, page: s.page, perPage: s.perPage };
    },
    tblPage(stateName, dir) {
      const s = this[stateName];
      const d = this.tblData(stateName, this._tblRaw(stateName));
      if (dir === 'next' && s.page < d.totalPages) s.page++;
      else if (dir === 'prev' && s.page > 1) s.page--;
    },
    tblPerPage(stateName, n) {
      this[stateName].perPage = n;
      this[stateName].page = 1;
    },
    _tblRaw(stateName) {
      if (stateName === 'tblContactos') return this.contactos;
      if (stateName === 'tblUsuarios') return this.usuarios;
      if (stateName === 'tblNotifUsuarios') return this.notifUsuarios;
      if (stateName === 'tblNotifLog') return this.notifLog;
      return [];
    },

    // ---------- Avatares ----------
    avatarIniciales(nombre) {
      if (!nombre) return '?';
      const partes = nombre.trim().split(/\s+/);
      if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
      return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
    },
    avatarColor(nombre) {
      const colores = ['#0a1f3d','#1a4a7a','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2'];
      let hash = 0;
      const str = nombre || '?';
      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      return colores[Math.abs(hash) % colores.length];
    },

    // ---------- Auth ----------
    async doLogin() {
      this.loginLoading = true; this.loginError = '';
      try {
        const r = await api.login(this.loginForm.username, this.loginForm.password);
        api.setToken(r.token); api.setUser(r.user);
        this.user = r.user; this.view = 'panel';
        this.tab = 'inicio';
        this.connectSocket();
      } catch (e) { this.loginError = e.message; }
      finally { this.loginLoading = false; }
    },
    async logout() {
      try { await api.logout(); } catch (_) {}
      if (this.socket) { this.socket.disconnect(); this.socket = null; }
      api.clear(); this.view = 'login'; this.loginForm = { username: '', password: '' };
    },

    // ---------- WhatsApp ----------
    async loadWa() {
      try { this.wa = await api.getWa(); } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async saveWa() {
      this.waSaving = true; this.waMsg = '';
      try {
        const r = await api.saveWa(this.wa);
        this.wa = r.config; this.wa.access_token = '';
        this.waMsg = 'Configuracion guardada.'; this.waMsgOk = true;
      } catch (e) { this.waMsg = e.message; this.waMsgOk = false; }
      finally { this.waSaving = false; }
    },
    async testWa() {
      this.waTesting = true; this.waMsg = '';
      try {
        const r = await api.testWa();
        this.waMsg = r.mensaje; this.waMsgOk = r.ok;
        await this.loadWa();
      } catch (e) { this.waMsg = e.message; this.waMsgOk = false; }
      finally { this.waTesting = false; }
    },
    async regenVerify() {
      try { const r = await api.regenVerify(); this.wa.verify_token = r.verify_token; this.showToast('Verify token generado'); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },

    // ---------- IA ----------
    async loadIa() {
      try { const r = await api.getIa(); this.ia = { ...this.ia, ...r, api_key: '' }; }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async saveIa(silent) {
      this.iaSaving = true; if (!silent) this.iaMsg = '';
      try {
        const r = await api.saveIa(this.ia);
        this.ia = { ...this.ia, ...r.config, api_key: '' };
        if (!silent) { this.iaMsg = 'Configuracion IA guardada.'; this.iaMsgOk = true; }
        else this.showToast('IA ' + (this.ia.ia_enabled ? 'activada' : 'desactivada'));
      } catch (e) { if (!silent) { this.iaMsg = e.message; this.iaMsgOk = false; } else this.showToast('Error: ' + e.message); }
      finally { this.iaSaving = false; }
    },
    async testIa() {
      this.iaTesting = true; this.iaMsg = '';
      try {
        const r = await api.testIa();
        this.iaMsg = r.mensaje; this.iaMsgOk = r.ok;
        await this.loadIa();
      } catch (e) { this.iaMsg = e.message; this.iaMsgOk = false; }
      finally { this.iaTesting = false; }
    },

    // ---------- IA Configs (CRUD multi-config) ----------
    async loadIaConfigs() {
      try { this.iaConfigs = await api.getIaConfigs(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    openNewIaConfig() {
      this.iaConfigEdit = null;
      this.iaConfigForm = { nombre: '', descripcion: '', ia_mode: 'respaldo', base_url: '', api_key: '', model_name: 'glm-5.2', temperature: 0.4, max_tokens: 300, system_prompt: '', max_messages_per_day: 50, activo: this.iaConfigs.length === 0 };
      this.iaConfigMsg = ''; this.showIaConfigKey = false;
      this.iaConfigModalOpen = true;
    },
    openEditIaConfig(c) {
      this.iaConfigEdit = c;
      this.iaConfigForm = { nombre: c.nombre || '', descripcion: c.descripcion || '', ia_mode: c.ia_mode || 'respaldo', base_url: c.base_url || '', api_key: '', model_name: c.model_name || 'glm-5.2', temperature: c.temperature ?? 0.4, max_tokens: c.max_tokens ?? 300, system_prompt: c.system_prompt || '', max_messages_per_day: c.max_messages_per_day ?? 50, activo: !!c.activo };
      this.iaConfigMsg = ''; this.showIaConfigKey = false;
      this.iaConfigModalOpen = true;
    },
    closeIaConfigModal() {
      this.iaConfigModalOpen = false;
      this.iaConfigEdit = null;
      this.iaConfigMsg = '';
    },
    async saveIaConfig() {
      this.iaConfigSaving = true; this.iaConfigMsg = '';
      try {
        if (!this.iaConfigForm.nombre.trim()) { this.iaConfigMsg = 'El nombre es obligatorio.'; this.iaConfigMsgOk = false; this.iaConfigSaving = false; return; }
        if (this.iaConfigEdit) {
          await api.updateIaConfig(this.iaConfigEdit.id, this.iaConfigForm);
          this.iaConfigMsg = 'Configuracion actualizada.'; this.iaConfigMsgOk = true;
        } else {
          await api.createIaConfig(this.iaConfigForm);
          this.iaConfigMsg = 'Configuracion creada.'; this.iaConfigMsgOk = true;
        }
        await this.loadIaConfigs();
        this.closeIaConfigModal();
      } catch (e) { this.iaConfigMsg = e.message; this.iaConfigMsgOk = false; }
      finally { this.iaConfigSaving = false; }
    },
    async toggleIaConfigActivo(c) {
      try {
        if (c.activo) {
          await api.deactivateAllIaConfigs();
        } else {
          await api.activateIaConfig(c.id);
        }
        await this.loadIaConfigs();
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async testIaConfig(c) {
      this.iaConfigTesting = true;
      try {
        const r = await api.testIaConfig(c.id);
        this.showToast(r.ok ? 'Conexion IA correcta' : 'Error: ' + r.mensaje);
        await this.loadIaConfigs();
      } catch (e) { this.showToast('Error: ' + e.message); }
      finally { this.iaConfigTesting = false; }
    },
    async deleteIaConfig(c) {
      this.showConfirm('Eliminar la configuracion "' + c.nombre + '"? Esta accion no se puede deshacer.', async () => {
        try { await api.deleteIaConfig(c.id); await this.loadIaConfigs(); this.showToast('Configuracion eliminada'); }
        catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar configuracion IA');
    },

    // ---------- Bot (legacy) ----------
    async loadBot() {
      try { this.bot = await api.getBot(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async saveBot() {
      this.botSaving = true; this.botMsg = '';
      try {
        const r = await api.saveBot(this.bot);
        this.bot = r.config; this.botMsg = 'Flujos guardados.'; this.botMsgOk = true;
      } catch (e) { this.botMsg = e.message; this.botMsgOk = false; }
      finally { this.botSaving = false; }
    },

    // ---------- Flujos Bot (CRUD) ----------
    async loadFlujosBot() {
      try { this.flujosBot = await api.getFlujosBot(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async setModoInicio(modo) {
      if (this.bot.modo_inicio !== modo) {
        this.showToast('Cambio aplicado');
      }
      this.bot.modo_inicio = modo;
      await this.saveBot();
      if (modo === 'ia') {
        try { await api.deactivateAllFlujosBot(); await this.loadFlujosBot(); } catch (_) {}
      }
    },
    async toggleModoInicio(enabled) {
      if (enabled) {
        this.bot.modo_inicio = this.modoInicioPrev || 'bot';
        this.showToast('Inicio de conversación habilitado');
      } else {
        this.modoInicioPrev = (this.bot.modo_inicio === 'none') ? 'bot' : this.bot.modo_inicio;
        this.bot.modo_inicio = 'none';
        this.showToast('Inicio de conversación deshabilitado');
      }
      await this.saveBot();
    },
    tryLeaveBotSection(newTab) {
      if (this.tab === 'bot' && this.bot.modo_inicio === 'bot') {
        const tieneActivo = this.flujosBot.some(f => f.activo);
        if (!tieneActivo) {
          this.botWarningModal = true;
          return false;
        }
      }
      this.tab = newTab;
      return true;
    },
    changeTab(newTab) {
      if (!this.tryLeaveBotSection(newTab)) return;
      if (window.innerWidth < 1024) this.sidebarOpen = false;
      if (newTab === 'notificaciones') {
        this.notifExpanded = true;
        if (!this.subtab || !this.subtab.startsWith('notif-')) this.subtab = 'notif-global';
        this.loadNotifGlobal(); this.loadNotifUsuarios(); this.loadNotifLog();
      } else {
        this.subtab = null;
        if (newTab === 'whatsapp') this.loadWa();
        else if (newTab === 'ia') this.loadIaConfigs();
        else if (newTab === 'bot') { this.loadBot(); this.loadFlujosBot(); }
        else if (newTab === 'agentes') this.loadConvs();
        else if (newTab === 'contactos') this.loadContactos();
        else if (newTab === 'metricas') this.loadMetricas();
        else if (newTab === 'usuarios') this.loadUsuarios();
        else if (newTab === 'masivos') this.loadMasivos();
      }
    },
    toggleNotifExpand() {
      this.notifExpanded = !this.notifExpanded;
      if (this.notifExpanded && this.tab !== 'notificaciones') {
        this.tab = 'notificaciones';
        this.subtab = 'notif-global';
        this.loadNotifGlobal(); this.loadNotifUsuarios(); this.loadNotifLog();
      }
    },
    selectNotifSubtab(sub) {
      this.tab = 'notificaciones';
      this.subtab = sub;
      this.notifExpanded = true;
      if (window.innerWidth < 1024) this.sidebarOpen = false;
    },
    changeSubtab(sub) { this.subtab = sub; },
    openNewFlujoBot() {
      this.flujoBotEdit = null;
      this.flujoBotForm = {
        nombre: '', descripcion: '',
        flujo: {
          mensaje_fallback: 'No entendi. Selecciona una opcion o escribe "asesor".',
          mensaje_escalamiento: '',
          mensaje_escalamiento_activo: false,
          niveles: 3,
          nodos: [{ id: 'nodo_1', mensaje: 'Hola! Como podemos ayudarte?', botones: [] }]
        }
      };
      this.flujoBotMsg = '';
      this.flujoBotModalOpen = true;
    },
    openEditFlujoBot(f) {
      this.flujoBotEdit = f;
      this.flujoBotForm = { nombre: f.nombre || '', descripcion: f.descripcion || '', flujo: f.flujo || { nodos: [] } };
      this.flujoBotMsg = '';
      this.flujoBotModalOpen = true;
    },
    closeFlujoBotModal() {
      this.flujoBotModalOpen = false;
      this.flujoBotEdit = null;
    },
    async saveFlujoBot() {
      this.flujoBotSaving = true; this.flujoBotMsg = '';
      try {
        if (!this.flujoBotForm.nombre.trim()) { this.flujoBotMsg = 'El nombre es obligatorio.'; this.flujoBotMsgOk = false; this.flujoBotSaving = false; return; }
        if (this.flujoBotEdit) {
          await api.updateFlujoBot(this.flujoBotEdit.id, this.flujoBotForm);
          this.showToast('Flujo actualizado');
        } else {
          await api.createFlujoBot(this.flujoBotForm);
          this.showToast('Flujo creado');
        }
        await this.loadFlujosBot();
        this.closeFlujoBotModal();
      } catch (e) { this.flujoBotMsg = e.message; this.flujoBotMsgOk = false; }
      finally { this.flujoBotSaving = false; }
    },
    async toggleFlujoBotActivo(f) {
      try {
        if (f.activo) { await api.deactivateAllFlujosBot(); }
        else { await api.activateFlujoBot(f.id); }
        await this.loadFlujosBot();
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async deleteFlujoBot(f) {
      this.showConfirm('Eliminar el flujo "' + f.nombre + '"?', async () => {
        try { await api.deleteFlujoBot(f.id); await this.loadFlujosBot(); this.showToast('Flujo eliminado'); }
        catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar flujo');
    },
    addBotonFlujo(nodo) {
      const btnId = 'btn_' + Date.now();
      nodo.botones = nodo.botones || [];
      nodo.botones.push({ id: btnId, texto: 'Nuevo boton', respuesta: '', escalar_humano: false, documentos: [], subbotones: [] });
    },
    removeBotonFlujo(nodo, idx) { nodo.botones.splice(idx, 1); },
    addSubboton(btn) {
      const sbId = 'sb_' + Date.now();
      btn.subbotones = btn.subbotones || [];
      btn.subbotones.push({ id: sbId, texto: 'Sub-boton', respuesta: '', escalar_humano: false, documentos: [], subbotones: [] });
    },
    removeSubboton(btn, idx) { btn.subbotones.splice(idx, 1); },
    async uploadDocFlujo(btn, event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = e.target.result.split(',')[1];
          const r = await api.uploadDocFlujoBot({ filename: file.name, base64, mimetype: file.type });
          btn.documentos = btn.documentos || [];
          btn.documentos.push({ filename: r.filename, url: r.url, name: file.name });
          this.showToast('Documento adjuntado: ' + file.name);
        } catch (err) { this.showToast('Error: ' + err.message); }
      };
      reader.readAsDataURL(file);
    },
    removeDocFlujo(btn, idx) { btn.documentos.splice(idx, 1); },

    // ---------- Conversaciones (bandeja de agentes) ----------
    async loadConvs() {
      try {
        const params = {};
        if (this.convFilter === 'mias') { params.soloMias = 'true'; }
        else if (this.convFilter) { params.modo = this.convFilter; }
        if (this.convFilter === 'pendiente') { params.estado = 'pendiente'; delete params.modo; }
        this.convs = await api.getConvs(params);
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async selectConv(id) {
      this.selectedConvId = id;
      try {
        this.selectedConv = await api.getConv(id);
        this.ventanaExpirada = this.selectedConv.conversacion?.ventana_24h_hasta &&
          new Date(this.selectedConv.conversacion.ventana_24h_hasta) < new Date();
        this.$nextTick(() => { if (this.$refs.chatScroll) this.$refs.chatScroll.scrollTop = this.$refs.chatScroll.scrollHeight; });
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async tomarConv() {
      try { await api.tomarConv(this.selectedConvId); await this.selectConv(this.selectedConvId); this.loadConvs(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async soltarConv() {
      try { await api.soltarConv(this.selectedConvId); await this.selectConv(this.selectedConvId); this.loadConvs(); this.showToast('Conversación soltada'); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async toggleIaConv() {
      try { await api.toggleIaConv(this.selectedConvId); await this.selectConv(this.selectedConvId); this.loadConvs(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async sendManual() {
      if (this.chatFilePending.length > 0) {
        const files = [...this.chatFilePending];
        const caption = this.manualMsg.trim();
        const replyTo = this.replyToMsg?.id || null;
        this.chatFilePreviewUrls.forEach(u => { if (u) URL.revokeObjectURL(u); });
        this.chatFilePending = [];
        this.chatFilePreviewUrls = [];
        this.chatFileIndex = 0;
        this.manualMsg = '';
        this.replyToMsg = null;
        try {
          // Si hay caption y múltiples archivos, enviar el texto una sola vez
          if (caption && files.length > 1) {
            await api.sendManual(this.selectedConvId, caption, replyTo);
          }
          for (const file of files) {
            const fileCaption = (files.length === 1) ? caption : '';
            await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = async (e) => {
                try {
                  const base64 = e.target.result.split(',')[1];
                  await api.sendChatMedia(this.selectedConvId, { filename: file.name, base64, mimetype: file.type, caption: fileCaption, reply_to: replyTo });
                  resolve();
                } catch (err) { reject(err); }
              };
              reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
              reader.readAsDataURL(file);
            });
          }
          await this.selectConv(this.selectedConvId);
        } catch (err) { this.showToast('Error: ' + err.message); }
        return;
      }
      if (!this.manualMsg.trim()) return;
      try {
        await api.sendManual(this.selectedConvId, this.manualMsg, this.replyToMsg?.id || null);
        this.manualMsg = '';
        this.replyToMsg = null;
        await this.selectConv(this.selectedConvId);
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    previewChatFile(event) {
      const files = Array.from(event.target.files);
      if (!files.length) return;
      event.target.value = '';
      for (const file of files) {
        this.chatFilePending.push(file);
        const url = (file.type.startsWith('image/') || file.type.startsWith('video/')) ? URL.createObjectURL(file) : null;
        this.chatFilePreviewUrls.push(url);
      }
      this.chatFileIndex = this.chatFilePending.length - files.length;
    },
    removeAttachFile(index) {
      if (this.chatFilePreviewUrls[index]) URL.revokeObjectURL(this.chatFilePreviewUrls[index]);
      this.chatFilePending.splice(index, 1);
      this.chatFilePreviewUrls.splice(index, 1);
      if (this.chatFileIndex >= this.chatFilePending.length) this.chatFileIndex = Math.max(0, this.chatFilePending.length - 1);
    },
    nextFile() {
      if (this.chatFileIndex < this.chatFilePending.length - 1) this.chatFileIndex++;
    },
    prevFile() {
      if (this.chatFileIndex > 0) this.chatFileIndex--;
    },
    cancelAttach() {
      this.chatFilePreviewUrls.forEach(u => { if (u) URL.revokeObjectURL(u); });
      this.chatFilePending = [];
      this.chatFilePreviewUrls = [];
      this.chatFileIndex = 0;
      this.manualMsg = '';
    },
    async enviarTemplate() {
      if (!this.templateName.trim()) return;
      try { await api.sendTemplate(this.selectedConvId, this.templateName); this.templateName = ''; await this.selectConv(this.selectedConvId); this.showToast('Plantilla enviada'); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async deleteConv() {
      this.showConfirm('Eliminar esta conversacion? Se borrara todo el historial de mensajes y la ficha del contacto. Esta accion no se puede deshacer.', async () => {
        try {
          await api.deleteConv(this.selectedConvId);
          this.selectedConv = null; this.selectedConvId = null;
          this.loadConvs(); this.showToast('Conversacion eliminada');
        } catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar conversacion');
    },

    async restaurarContacto() {
      try {
        const contactoId = this.selectedConv.contacto?.id;
        if (!contactoId) return;
        await api.restoreContacto(contactoId);
        await this.selectConv(this.selectedConvId);
        this.loadConvs();
        this.showToast('Contacto agregado nuevamente');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },

    // ---------- Reply / Forward ----------

    canInteractMessages() {
      const conv = this.selectedConv?.conversacion;
      if (!conv) return false;
      return conv.modo === 'humano' && (!conv.agente_id || conv.agente_id === this.user.id);
    },

    getMsgById(id) {
      if (!this.selectedConv?.mensajes) return null;
      return this.selectedConv.mensajes.find(m => m.id === id) || null;
    },

    getMsgPreview(m) {
      if (!m) return '';
      if (m.reply_to_msg) return m.reply_to_msg.texto || '';
      const c = m.contenido || {};
      return c.text || c.body || c.caption || c.title || c.filename || '[' + (m.tipo || 'msg') + ']';
    },

    // --- Context menu (PC: right-click only, not mobile/tablet) ---
    openMsgContextMenu(event, m) {
      if (!this.canInteractMessages()) return;
      if (window.innerWidth < 1024) return;
      const x = Math.min(event.clientX, window.innerWidth - 180);
      const y = Math.min(event.clientY, window.innerHeight - 120);
      this.msgContextMenu = { open: true, messageId: m.id, x, y };
    },
    closeMsgContextMenu() {
      this.msgContextMenu = { open: false, messageId: null, x: 0, y: 0 };
    },

    // --- Reply ---
    startReply(m) {
      this.closeMsgContextMenu();
      if (!m) return;
      this.replyToMsg = m;
      this.$nextTick(() => {
        const input = this.$refs.chatInput;
        if (input) input.focus();
      });
    },
    cancelReply() {
      this.replyToMsg = null;
    },
    scrollToMessage(msgId) {
      const el = this.$refs.chatScroll;
      if (!el) return;
      const bubble = el.querySelector('[data-msg-id="' + msgId + '"]');
      if (bubble) {
        bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bubble.classList.add('wa-bubble-highlight');
        setTimeout(() => bubble.classList.remove('wa-bubble-highlight'), 1500);
      }
    },

    // --- Forward ---
    async openForwardModal(m) {
      this.closeMsgContextMenu();
      this.forwardModal = {
        open: true,
        messages: m ? [m] : [],
        contactos: [],
        selectedContactos: [],
        search: '',
        sending: false,
        result: null,
      };
      try {
        this.forwardModal.contactos = await api.getContactos('');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    closeForwardModal() {
      this.forwardModal = { open: false, messages: [], contactos: [], selectedContactos: [], search: '', sending: false, result: null };
    },
    async searchForwardContactos() {
      try {
        this.forwardModal.contactos = await api.getContactos(this.forwardModal.search);
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    toggleForwardContacto(id) {
      const idx = this.forwardModal.selectedContactos.indexOf(id);
      if (idx >= 0) this.forwardModal.selectedContactos.splice(idx, 1);
      else this.forwardModal.selectedContactos.push(id);
    },
    removeForwardMessage(idx) {
      this.forwardModal.messages.splice(idx, 1);
      if (this.forwardModal.messages.length === 0) this.closeForwardModal();
    },
    async executeForward() {
      if (this.forwardModal.messages.length === 0 || this.forwardModal.selectedContactos.length === 0) return;
      this.forwardModal.sending = true;
      this.forwardModal.result = null;
      try {
        const messageIds = this.forwardModal.messages.map(m => m.id);
        const result = await api.forwardMessages(this.selectedConvId, messageIds, this.forwardModal.selectedContactos);
        this.forwardModal.result = result;
        this.showToast('Reenvio: ' + result.enviados + ' enviados, ' + result.fallidos + ' fallidos');
      } catch (e) {
        this.showToast('Error: ' + e.message);
      } finally {
        this.forwardModal.sending = false;
      }
    },

    // --- Swipe (mobile/tablet: swipe right to reply, swipe left to forward) ---
    onTouchStart(event, m) {
      if (!this.canInteractMessages()) return;
      if (event.touches.length !== 1) return;
      this.swipeState = { msgId: m.id, startX: event.touches[0].clientX, currentX: event.touches[0].clientX, active: true };
    },
    onTouchMove(event, m) {
      if (!this.swipeState.active || this.swipeState.msgId !== m.id) return;
      this.swipeState.currentX = event.touches[0].clientX;
    },
    onTouchEnd(event, m) {
      if (!this.swipeState.active || this.swipeState.msgId !== m.id) return;
      const deltaX = this.swipeState.currentX - this.swipeState.startX;
      this.swipeState = { msgId: null, startX: 0, currentX: 0, active: false };
      if (deltaX > 60) {
        this.startReply(m);
      } else if (deltaX < -60) {
        this.openForwardModal(m);
      }
    },
    swipeOffset(m) {
      if (!this.swipeState.active || this.swipeState.msgId !== m.id) return 0;
      const delta = this.swipeState.currentX - this.swipeState.startX;
      return Math.max(-80, Math.min(delta, 80));
    },

    // ---------- Contactos ----------
    async loadContactos() {
      try { this.contactos = await api.getContactos(this.contactoSearch); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    editContacto(c) {
      this.contactoEdit = c;
      this.contactoEditName = c.nombre || '';
      this.contactoEditTags = (c.etiquetas || []).join(', ');
      this.contactoEditNotas = c.notas || '';
    },
    async saveContacto() {
      try {
        await api.updateContacto(this.contactoEdit.id, {
          nombre: this.contactoEditName,
          etiquetas: this.contactoEditTags.split(',').map(s => s.trim()).filter(Boolean),
          notas: this.contactoEditNotas,
        });
        this.contactoEdit = null; this.loadContactos(); this.showToast('Contacto actualizado');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async deleteContacto(c) {
      this.showConfirm('Eliminar el contacto "' + (c.nombre || c.wa_id) + '"? Las conversaciones asociadas se conservaran pero se marcaran como eliminadas.', async () => {
        try { await api.deleteContacto(c.id); this.loadContactos(); this.showToast('Contacto eliminado'); }
        catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar contacto');
    },

    // ---------- Metricas ----------
    async loadMetricas() {
      try { this.metricas = await api.getMetricas(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },

    // ---------- Usuarios ----------
    async loadUsuarios() {
      try { this.usuarios = await api.getUsuarios(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    openCreateUser() {
      this.newUser = { username: '', nombre: '', password: '', role: 'agente' };
      this.userCreateOpen = true;
    },
    async createUser() {
      if (!this.newUser.username || !this.newUser.password) { this.showToast('Usuario y contrasena requeridos'); return; }
      try {
        await api.createUsuario(this.newUser);
        this.userCreateOpen = false;
        this.loadUsuarios(); this.showToast('Usuario creado');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async resetUserPass(u) {
      const pass = prompt('Nueva contrasena para ' + u.username + ':');
      if (!pass) return;
      try { await api.updateUsuarioPassword(u.id, pass); this.showToast('Contrasena actualizada'); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async toggleUserActivo(u) {
      try { await api.setUsuarioActivo(u.id, !u.activo); this.loadUsuarios(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    editUser(u) {
      this.userEdit = u;
      this.userEditForm = { username: u.username, nombre: u.nombre || '', role: u.role, password: '' };
    },
    async saveEditUser() {
      try {
        await api.updateUsuario(this.userEdit.id, {
          username: this.userEditForm.username,
          nombre: this.userEditForm.nombre,
          role: this.userEditForm.role,
        });
        // Si se ingreso una nueva clave, actualizarla.
        if (this.userEditForm.password) {
          await api.updateUsuarioPassword(this.userEdit.id, this.userEditForm.password);
        }
        this.userEdit = null; this.loadUsuarios(); this.showToast('Usuario actualizado');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },
    async deleteUser(u) {
      this.showConfirm('Eliminar el usuario "' + u.username + '"? Esta accion no se puede deshacer.', async () => {
        try { await api.deleteUsuario(u.id); this.loadUsuarios(); this.showToast('Usuario eliminado'); }
        catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar usuario');
    },

    // ---------- Notificaciones ----------
    async loadNotifGlobal() {
      try { this.notifGlobal = { ...this.notifGlobal, ...await api.getNotifGlobal(), smtp_pass: '' }; }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async loadNotifUsuarios() {
      try { this.notifUsuarios = await api.getNotifUsuarios(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async loadNotifLog() {
      try { this.notifLog = await api.getNotifLog(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async saveNotifGlobal() {
      this.notifSaving = true;
      try { const r = await api.saveNotifGlobal(this.notifGlobal); this.notifGlobal = { ...r.config, smtp_pass: '' }; this.showToast('Configuracion guardada'); }
      catch (e) { this.showToast('Error: ' + e.message); }
      finally { this.notifSaving = false; }
    },
    async saveNotifUsuario(u) {
      try {
        await api.saveNotifUsuario(u.usuario_id || u.id, {
          activado: u.activado, email: u.email, whatsapp_personal: u.whatsapp_personal,
          mensaje_personalizado: u.mensaje_personalizado,
          recurrencia_activada: u.recurrencia_activada, recurrencia_minutos: u.recurrencia_minutos,
        });
        this.showToast('Notificacion actualizada');
      } catch (e) { this.showToast('Error: ' + e.message); }
    },

    // ---------- Mensajes Masivos ----------
    async loadMasivos() {
      try { this.masivos = await api.getMasivos(); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    async loadMasivoContactos() {
      try { this.masivoContactos = await api.getContactos(this.masivoSearch); }
      catch (e) { this.showToast('Error: ' + e.message); }
    },
    openNewMasivo() {
      this.masivoEdit = null;
      this.masivoForm = { nombre: '', mensaje: '', contactos: [], enviar_a_todos: false, template_name: '', language: 'en_US', archivo_adjunto: null };
      this.masivoSearch = ''; this.masivoSelectAll = false;
      this.masivoVentana = { dentro_24h: 0, fuera_24h: 0, total: 0, contactos: [] };
      this.masivoContactosExpanded = false;
      this.masivoModalOpen = true;
      this.loadMasivoContactos();
    },
    openEditMasivo(m) {
      this.masivoEdit = m;
      this.masivoForm = { nombre: m.nombre || '', mensaje: m.mensaje || '', contactos: m.contactos || [], enviar_a_todos: m.enviar_a_todos || false, template_name: m.template_name || '', language: m.language || 'en_US', archivo_adjunto: m.archivo_adjunto || null };
      this.masivoSearch = ''; this.masivoSelectAll = false;
      this.masivoVentana = { dentro_24h: 0, fuera_24h: 0, total: 0, contactos: [] };
      this.masivoContactosExpanded = false;
      this.masivoModalOpen = true;
      this.loadMasivoContactos();
      this.checkVentanaMasivo();
    },
    closeMasivoModal() {
      this.masivoModalOpen = false;
      this.masivoEdit = null;
    },
    async checkVentanaMasivo() {
      if (this.masivoForm.enviar_a_todos) {
        this.masivoCheckingVentana = true;
        try {
          this.masivoVentana = await api.checkVentana({ enviar_a_todos: true });
        } catch (_) {}
        finally { this.masivoCheckingVentana = false; }
        return;
      }
      if (this.masivoForm.contactos.length === 0) {
        this.masivoVentana = { dentro_24h: 0, fuera_24h: 0, total: 0, contactos: [] };
        return;
      }
      this.masivoCheckingVentana = true;
      try {
        this.masivoVentana = await api.checkVentana({ contactos_ids: this.masivoForm.contactos });
      } catch (_) {}
      finally { this.masivoCheckingVentana = false; }
    },
    toggleMasivoContacto(id) {
      const idx = this.masivoForm.contactos.indexOf(id);
      if (idx === -1) this.masivoForm.contactos.push(id);
      else this.masivoForm.contactos.splice(idx, 1);
      this.checkVentanaMasivo();
    },
    toggleMasivoSelectAll() {
      if (this.masivoForm.enviar_a_todos) {
        this.masivoForm.enviar_a_todos = false;
      } else {
        this.masivoForm.enviar_a_todos = true;
        this.masivoForm.contactos = [];
      }
      this.checkVentanaMasivo();
    },
    async uploadDocMasivo(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = e.target.result.split(',')[1];
          const r = await api.uploadDocFlujoBot({ filename: file.name, base64, mimetype: file.type });
          this.masivoForm.archivo_adjunto = { filename: r.filename, url: r.url, name: file.name, mimetype: file.type };
          this.showToast('Archivo adjuntado: ' + file.name);
        } catch (err) { this.showToast('Error: ' + err.message); }
      };
      reader.readAsDataURL(file);
    },
    removeDocMasivo() { this.masivoForm.archivo_adjunto = null; },
    async saveMasivo() {
      this.masivoSaving = true;
      try {
        if (!this.masivoForm.nombre.trim()) { this.showToast('El nombre es obligatorio'); this.masivoSaving = false; return; }
        if (!this.masivoForm.mensaje.trim() && !this.masivoForm.template_name.trim()) { this.showToast('Debes llenar el mensaje libre o la plantilla (o ambos)'); this.masivoSaving = false; return; }
        if (!this.masivoForm.enviar_a_todos && this.masivoForm.contactos.length === 0) { this.showToast('Selecciona al menos un contacto'); this.masivoSaving = false; return; }
        if (this.masivoEdit) {
          await api.updateMasivo(this.masivoEdit.id, this.masivoForm);
          this.showToast('Mensaje masivo actualizado');
        } else {
          await api.createMasivo(this.masivoForm);
          this.showToast('Mensaje masivo creado');
        }
        await this.loadMasivos();
        this.closeMasivoModal();
      } catch (e) { this.showToast('Error: ' + e.message); }
      finally { this.masivoSaving = false; }
    },
    async enviarMasivo(m) {
      this.masivoEnviando = true;
      try {
        const r = await api.enviarMasivo(m.id);
        let msg = 'Enviados: ' + r.enviados + ' OK, ' + r.fallidos + ' fallidos de ' + r.total;
        if (r.reintentos > 0) msg += ' (' + r.reintentos + ' reenviados con template)';
        this.showToast(msg);
        await this.loadMasivos();
      } catch (e) { this.showToast('Error: ' + e.message); }
      finally { this.masivoEnviando = false; }
    },
    async deleteMasivo(m) {
      this.showConfirm('Eliminar el mensaje masivo "' + m.nombre + '"?', async () => {
        try { await api.deleteMasivo(m.id); await this.loadMasivos(); this.showToast('Mensaje eliminado'); }
        catch (e) { this.showToast('Error: ' + e.message); }
      }, 'Eliminar mensaje masivo');
    },
  };
}
