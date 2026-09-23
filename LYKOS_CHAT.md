# Lykos Chat — Documentación Técnica Completa

## 1. Descripción General

Lykos Chat es un sistema autoalojado (self-hosted) de chatbot para **WhatsApp Business Cloud API** con IA opcional, panel de administración web y handoff humano. Permite recibir mensajes de clientes por WhatsApp y responderlos automáticamente mediante flujos predefinidos (Bot), inteligencia artificial (IA) o manualmente desde un panel web (Humano).

---

## 2. Tecnologías Utilizadas

| Capa | Tecnología | Versión / Detalle |
|---|---|---|
| **Backend** | Node.js + Express | Node.js >= 22 (obligatorio) |
| **Base de datos** | SQLite (`node:sqlite`) | Módulo integrado de Node 22, sin compilación nativa |
| **Frontend** | HTML + CSS + Alpine.js | Servido como estáticos por Express |
| **Tipografía** | Inter | Cargada desde Google Fonts |
| **Tiempo real** | Socket.io | Mensajes instantáneos en panel de agentes |
| **Auth** | JWT + bcrypt | Roles admin y agente |
| **Cifrado** | AES-256-GCM | Tokens y API keys cifrados en BD |
| **Cliente IA** | OpenAI SDK (`openai`) | baseURL configurable (compatible con cualquier proveedor) |
| **Email** | Nodemailer | Notificaciones por correo SMTP |
| **WhatsApp** | Meta Graph API v19.0 | Cloud API oficial |

### Dependencias (package.json)

```
axios, bcryptjs, cors, dotenv, express, express-rate-limit,
helmet, jsonwebtoken, morgan, openai, socket.io, nodemailer
```

---

## 3. Arquitectura del Proyecto

```
lykos_chat/
├── backend/src/
│   ├── config/              # Configuración base
│   │   ├── env.js           # Variables de entorno
│   │   ├── database.js      # Conexión SQLite + migraciones
│   │   └── encryption.js    # Cifrado AES-256-GCM
│   ├── migrations/          # Esquema SQL
│   │   ├── 001_init.sql     # Tablas principales
│   │   ├── 002_add_app_secret.sql
│   │   └── 003_notificaciones.sql
│   ├── models/              # Capa de datos (una por tabla)
│   │   ├── configWhatsApp.js
│   │   ├── configIA.js
│   │   ├── configBot.js
│   │   ├── usuario.js
│   │   ├── contacto.js
│   │   ├── conversacion.js
│   │   ├── mensaje.js
│   │   ├── usoIA.js
│   │   └── notificacionModel.js
│   ├── routes/              # Rutas Express (API REST)
│   │   ├── auth.js
│   │   ├── config.js
│   │   ├── webhook.js
│   │   ├── conversaciones.js
│   │   ├── contactos.js
│   │   ├── metricas.js
│   │   ├── usuarios.js
│   │   └── notificaciones.js
│   ├── services/            # Lógica de negocio
│   │   ├── whatsappService.js     # Envío de mensajes WhatsApp
│   │   ├── iaService.js           # Cliente IA genérico
│   │   ├── webhookService.js      # Recepción y parseo de webhooks
│   │   ├── orquestador.js         # Decisión de modo (bot/IA/humano)
│   │   ├── flujosService.js       # Flujos/menús del bot
│   │   ├── handoffService.js      # Escalado a humano
│   │   ├── authService.js         # Login JWT
│   │   └── notificacionService.js # Notificaciones WA + email
│   ├── middleware/
│   │   └── auth.js          # JWT + control de roles
│   ├── sockets/
│   │   └── index.js         # Socket.io (tiempo real)
│   ├── scripts/
│   │   ├── migrate.js       # Aplicar migraciones
│   │   └── seed.js          # Crear admin inicial
│   ├── utils/
│   │   └──: logger.js       # Logger con persistencia en BD
│   └── server.js            # Punto de entrada
├── public/                  # Frontend
│   ├── index.html           # App principal (Alpine.js)
│   ├── js/
│   │   ├── api.js           # Helper de API (fetch + JWT)
│   │   └── app.js           # Componente Alpine (estado + métodos)
│   └── css/
│       └── app.css          # Design system + responsivo
├── data/                    # SQLite (se crea automáticamente)
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## 4. Base de Datos

### Esquema completo (12 tablas)

| Tabla | Descripción |
|---|---|
| `config_whatsapp` | Credenciales WhatsApp (token y app_secret cifrados AES-256-GCM) |
| `config_ia` | Configuración IA (API key cifrada, baseURL, modelo, prompt) |
| `config_bot` | Flujos/menús/palabras clave del bot |
| `config_notificaciones` | Config global de notificaciones (URL software, SMTP) |
| `usuarios` | Admin y agentes (JWT, bcrypt, rol, estado activo) |
| `contactos` | Clientes de WhatsApp (wa_id, nombre, etiquetas, notas) |
| `conversaciones` | Una por contacto (modo, estado, agente asignado, sesión) |
| `mensajes` | Historial (dirección, tipo, contenido, origen, status) |
| `uso_ia` | Registro de tokens IA por llamada (prompt, completion, total) |
| `eventos_procesados` | Deduplicación de eventos del webhook (UNIQUE wam_id) |
| `logs_api` | Errores de APIs para diagnóstico en el panel |
| `notificaciones_config` | Config de notificaciones por usuario (email, WA, recurrencia) |
| `notificaciones_log` | Historial de notificaciones enviadas |

### Migraciones

Sistema idempotente con tabla `_migrations` que registra las migraciones aplicadas. Las migraciones `.sql` se ejecutan en orden alfabético al arrancar el servidor.

---

## 5. Funcionamiento Detallado

### 5.1 Flujo de un mensaje entrante

```
Cliente WhatsApp → Meta Cloud API → Webhook (POST) → ngrok/Dominio → Servidor
```

1. **Meta** envía `POST /webhook` con el mensaje
2. **Validación de firma** `X-Hub-Signature-256` (HMAC-SHA256 con App Secret)
3. **Respuesta 200 inmediata** a Meta (requisito obligatorio)
4. **Procesamiento en segundo plano** (`setImmediate`):
   a. **Deduplicación** por `wam_id` (Meta puede reenviar)
   b. **Crear/actualizar contacto** (`contactoModel.upsert`)
   c. **Crear/obtener conversación** (`conversacionModel.getOrCreate`)
   d. **Guardar mensaje entrante** en BD
   e. **Notificar** a empleados configurados (WhatsApp + email)
   f. **Delegar al orquestador** para decidir respuesta

### 5.2 Orquestador de modos

El orquestador decide cómo responder según el modo de la conversación:

| Modo | Comportamiento |
|---|---|
| **humano** | No responde automático. Notifica al agente via Socket.io. |
| **ia** | Llama al LLM con historial (últimos 10 mensajes) + system prompt. |
| **bot** | Busca en flujos/palabras clave. Si no coincide y IA está en modo "respaldo", consulta IA. Si no, envía fallback con botones. |

### 5.3: 5.3 Instrucción fija de IA

El backend inyecta automáticamente esta instrucción en el system prompt (no editable):

> "Si el usuario pide hablar con un asesor o humano, responde únicamente con la etiqueta [ESCALAR_HUMANO] y nada más."

Cuando la IA devuelve `[ESCALAR_HUMANO]`, el orquestador activa el handoff automáticamente.

### 5.4 Handoff a humano

Se activa por:
- Palabra clave del cliente ("asesor", "humano", etc.)
- Etiqueta `[ESCALAR_HUMANO]` de la IA
- Botón del flujo del bot
- Cambio manual desde el panel

Al activarse:
1. Conversación → modo "humano", estado "pendiente"
2. Cliente recibe: "Un asesor te atenderá en unos momentos"
3. Agentes reciben notificación (Socket.io: toast + sonido)
4. Un agente toma la conversación y responde manualmente

### 5.5 Notificaciones a empleados

Cuando llega un mensaje nuevo, se notifica a usuarios con notificaciones activas:

- **WhatsApp**: Mensaje con botón interactivo "Enterado" (detiene recurrencia al hacer clic)
- **Email**: Email con link "Enterado" (detiene recurrencia al hacer clic)
- **Recurrencia**: Notificaciones repetidas cada N minutos hasta que el empleado haga clic en "Enterado" o inicie sesión

### 5.6 Ventana de 24 horas

WhatsApp solo permite mensajes libres dentro de las 24h siguientes al último mensaje del cliente. El sistema:
- Renueva la ventana al recibir cada mensaje
- Si expiró, el panel ofrece enviar una **plantilla** (template) para reabrir

---

## 6. API REST

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (JWT) |
| GET | `/api/auth/profile` | Perfil del usuario |

1 | GET | `/api/config/whatsapp` | Leer config WhatsApp (admin) |
| PUT | `/api/config/whatsapp` | Guardar config WhatsApp (admin) |
| POST | `/api/config/whatsapp/test` | Probar conexión WhatsApp (admin) |
| GET | `/api/config/ia` | Leer config IA (admin) |
| PUT | `/api/config/ia` | Guardar config IA (admin) |
| POST | `/api/config/ia/test` | Probar conexión IA (admin) |
| GET | `/api/config/bot` | Leer flujos del bot (admin) |
| PUT | `/api/config/bot` | Guardar flujos del bot (admin) |

### Webhook

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/webhook` | Verificación de Meta (hub.challenge) |
| POST | `/webhook` | Recepción de mensajes (firma HMAC-SHA256) |

### Conversaciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/conversaciones` | Lista con filtros (modo, estado, mías) |
| GET | `/api/conversaciones/:id` | Detalle con mensajes |
| PUT | `/api/conversaciones/:id/modo` | Cambiar modo (bot/ia/humano) |
| POST | `/api/conversaciones/:id/tomar` | Tomar conversación |
| POST | `/api/conversaciones/:id/devolver-bot` | Devolver al bot |
| POST | `/api/conversaciones/:id/activar-ia` | Activar IA en chat |
| POST | `/api/conversaciones/:id/mensajes` | Envío manual de agente |
| POST | `/api/conversaciones/:id/template` | Enviar plantilla (fuera de 24h) |

### Contactos, Métricas, Usuarios, Notificaciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/contactos` | CRUD contactos |
| GET | `/api/metricas` | Dashboard (admin) |
| GET/POST/PUT/DELETE | `/api/usuarios` | Gestión usuarios (admin) |
| GET/PUT | `/api/notificaciones/global` | Config global notificaciones (admin) |
| GET/PUT | `/api/notificaciones/usuarios` | Config notificaciones por usuario (admin) |
| GET | `/api/notificaciones/enterado/:id` | Detener recurrencia (link email) |
| GET | `/api/notificaciones/log` | Historial de envíos (admin) |

---

## 7. Panel Web (Frontend)

### Roles y permisos

| Función | Admin | Agente |
|---|---|---|
| WhatsApp (config) | ✅ | ❌ |
| IA (config) | ✅ | ❌ |
| Flujos del Bot | ✅ | ❌ |
| Agentes (chat) | ✅ | ✅ |
| Contactos | ✅ | ✅ |
| Métricas | ✅ | ❌ |
| Usuarios | ✅ | ❌ |
| Notificaciones | ✅ | ❌ |

### Navegación

- **Sidebar lateral colapsable** con icono hamburguesa
- Secciones agrupadas: "Configuración" y "Operación"
- En móvil: drawer deslizante con overlay oscuro
- En tablet: modo iconos (64px)

### Responsivo (3 breakpoints)

| Breakpoint | Comportamiento |
|---|---|
| **≥ 1024px** (PC) | Sidebar completo, layouts de 2 columnas, chat lado a lado |
| **$ | **768–1023px** (Tablet) | Sidebar iconos, 1 columna, chat lista angosta |
| **< 768px** (Móvil) | Sidebar drawer, todo 1 columna, chat tipo app mensajería |

---

## 8. Seguridad

| Medida | Implementación |
|---|---|
| Cifrado de credenciales | AES-256-GCM (token WhatsApp, API key IA, App Secret, SMTP pass) |
| Firma del webhook | HMAC-SHA256 con App Secret (comparación constante-tiempo) |
| Auth | JWT con expiración (12h) |
| Contraseñas | bcrypt (hash irreversible) |
| Rate limiting | 10 intentos de login / 15 minutos |
| Roles | Middleware `requireAdmin` (403 a agentes en rutas admin) |
| Helmet | Headers de seguridad HTTP |
| CORS | Configurable |
| Cero credenciales en código | Todo desde panel o variables de entorno |

---

## 9. Cliente IA (Genéric/ Genérico)

El cliente IA usa la librería `openai` con `baseURL` configurable. **No está acoplado a OpenAI ni a ningún proveedor específico**. Funciona con cualquier endpoint compatible con el formato `/v1/chat/completions`:

| Proveedor | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Huawei Cloud MaaS | `https://api-ap-southeast-1.modelarts-maas.com/openai/v1` |
| Cualquier otro | URL del proveedor compatible |

### Parámetros configurables

- Temperature (0-1, default 0.4)
- Max tokens de respuesta (default 300)
- System prompt (contexto del negocio, editable)
- Límite de mensajes IA por conversación/día (default 50)
- Modo: "respaldo" (bot primero, IA si no entiende) o "principal" (IA maneja todo)

---

## 10. Configuración

### Variables de entorno (.env)

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | 3000 |
| `PUBLIC_URL` | URL pública (dominio) | http://localhost:3000 |
| `DB_PATH` | Ruta de la BD SQLite | ./data/lykos.db |
| `JWT_SECRET` | Secreto JWT | (generar) |
| `ENCRYPTION_KEY` | Clave cifrado AES (64 hex) | (generar) |
| `ADMIN_USERNAME` | Usuario admin inicial | admin |
| `ADMIN_PASSWORD` | Password admin inicial | admin123 |
| `WEBHOOK_VERIFY_TOKEN` | Token verificación webhook | (autogenerable) |

### Credenciales por defecto

- Usuario: `admin`
- Contraseña: `admin123`

---

## 11. Despliegue

### Desarrollo local

```bash
npm install
npm run seed    # crea BD + admin
npm start       # servidor en localhost:3000
```

### Con ngrok (desarrollo)

```bash
ngrok http 3000
# Usar la URL HTTPS en Meta webhook config
```

### Producción (VPS)

```bash
# 1. Instalar Node.js 22 + PM2 + Nginx + Certbot
# 2. Subir código, npm install, npm run seed
# 3. pm2 start backend/src/server.js
# 4. Nginx reverse proxy + SSL Let's Encrypt
# 5. Configurar webhook en Meta con dominio real
```

### Docker

```bash
docker-compose up -d
```

---

## 12. Limitaciones Conocidas

| Limitación | Detalle |
|---|---|
| SQLite | No soporta concurrencia extrema (>100K mensajes → migrar a PostgreSQL) |
| Fotos de perfil | WhatsApp Cloud API no expone fotos de contacto (se usan avatares con iniciales) |
| Ventana 24h | WhatsApp requiere template para enviar fuera de 24h |
| Node.js 22 | Obligatorio (usa `node:sqlite` integrado) |
| App Secret | Si se cambia ENCRYPTION_KEY, las credenciales cifradas deben reingresarse |

---

## 13. Documentos del Proyecto

| Archivo | Contenido |
|---|---|
| `historial.txt` | Historial del desarrollo, prompts, problemas resueltos, diagrama de flujo |
| `proceso para migración.txt` | Guía de migración local → hosting (VPS, Docker) |
| `Manual de1 | `Manual de usuario del software Lykos chat.txt` | Manual de uso para admin y agente |
| `LYKOS_CHAT.md` | Este documento (contexto técnico completo) |
