# Lykos Chat

Chatbot autoalojado para **WhatsApp Business Cloud API** con IA opcional, panel de administración web y handoff humano.

## Características

- **3 modos configurables** por conversación y globalmente:
  - **Bot**: flujos/menús predefinidos con botones interactivos nativos de WhatsApp (sin IA).
  - **IA**: respuestas generadas por un LLM vía API compatible con OpenAI (cualquier proveedor: OpenAI, Huawei Cloud MaaS, etc.).
  - **Humano**: un agente responde desde el panel web.
- **Panel de configuración** donde el admin ingresa credenciales de WhatsApp e IA sin tocar código.
- **Webhook** con validación de firma `X-Hub-Signature-256`, deduplicación y parseo de todos los tipos de mensaje.
- **Handoff automático**: la IA puede escalar a humano con la etiqueta `[ESCALAR_HUMANO]`.
- **Bandeja de agentes** en tiempo real (Socket.io) con chat estilo WhatsApp.
- **Dashboard de métricas**: conversaciones, mensajes, % por modo, tokens IA.
- **Cifrado AES-256-GCM** de tokens y API keys en la base de datos.
- **Roles** admin y agente con JWT.

## Stack

- **Backend**: Node.js + Express + Socket.io
- **Base de datos**: SQLite (módulo integrado `node:sqlite`, migrable a PostgreSQL)
- **Frontend**: HTML + Tailwind CSS + Alpine.js (servido como estáticos)
- **Auth**: JWT con roles (admin/agente)
- **Cliente IA**: librería `openai` con `baseURL` configurable (genérico, no acoplado a un proveedor)

## Requisitos

- Node.js >= 22 (usa el módulo integrado `node:sqlite`)
- Una cuenta de WhatsApp Business en [developers.facebook.com](https://developers.facebook.com)
- (Opcional) Acceso a una API de IA compatible con OpenAI

## Instalación

```bash
# 1. Clonar e instalar dependencias
npm install

# 2. Crear .env desde el ejemplo
cp .env.example .env

# 3. Generar clave de cifrado y ponerla en .env (ENCRYPTION_KEY)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Inicializar la base de datos y crear el admin inicial
npm run seed

# 5. Arrancar
npm start
```

El panel estará en `http://localhost:3000`.

**Credenciales por defecto**: usuario `admin`, contraseña `admin123` (cambiable en `.env` antes del seed).

## Docker

```bash
docker-compose up -d
```

## Exponer el webhook con ngrok (desarrollo local)

Meta necesita una URL pública para enviar los webhooks. Usa ngrok:

```bash
ngrok http 3000
```

Copia la URL HTTPS que te da ngrok (ej: `https://abcd-1234.ngrok-free.app`) y:

1. Ponla en `.env` como `PUBLIC_URL=https://abcd-1234.ngrok-free.app` (o desde el panel).
2. Reinicia el servidor.
3. En el panel, pestaña **WhatsApp**, el campo "URL pública del sistema" mostrará la URL.
4. El webhook completo es: `https://abcd-1234.ngrok-free.app/webhook`

## Configuración en developers.facebook.com

### 1. Crear la app de Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Tipo: **Business**. Nombre: el que quieras.
3. En el menú izquierdo, añade el producto **WhatsApp**.

### 2. Obtener credenciales

En **WhatsApp > API Setup**:

| Dato en Meta | Campo en el panel (pestaña WhatsApp) |
|---|---|
| **Phone Number ID** | Phone Number ID |
| **WhatsApp Business Account ID** | WABA ID |
| **Permanent Access Token** (ver abajo) | Token de acceso |

**Token permanente**: en **WhatsApp > API Setup** haz clic en "Get Token" o ve a **System Users** (Business Manager) y crea un token permanente con permisos `whatsapp_business_messaging`.

**App Secret**: en **App Settings > Basic** > **App Secret** (cópialo en el campo "App Secret" del panel).

### 3. Configurar el webhook

1. En **WhatsApp > Configuration > Webhook**:
   - **Callback URL**: pega `https://tu-url.ngrok-free.app/webhook`
   - **Verify Token**: copia el que aparece en el panel (o genera uno nuevo con el botón "Generar")
   - Haz clic en **Verify and Save**.
2. En **Webhook fields**, suscríbete al campo **messages**.

### 4. Probar

- En el panel, pestaña **WhatsApp**, haz clic en **Probar conexión**.
- Envía un mensaje desde tu teléfono a tu número de WhatsApp Business.
- Debería aparecer en la pestaña **Agentes**.

## Configurar la IA (opcional)

La IA es **opcional**. Si la desactivas, el sistema funciona solo con flujos del bot.

1. Ve al panel, pestaña **Inteligencia Artificial**.
2. Activa el interruptor **IA habilitada**.
3. Elige el modo:
   - **IA como respaldo**: el bot responde primero; si no entiende, consulta a la IA.
   - **IA como principal**: toda la conversación la maneja la IA.
4. Completa:
   - **Base URL**: la URL de tu proveedor compatible con OpenAI.
     - OpenAI: `https://api.openai.com/v1`
     - Huawei Cloud MaaS: `https://api-ap-southeast-1.modelarts-maas.com/openai/v1`
     - Cualquier otro endpoint compatible con `/v1/chat/completions`.
   - **API Key**: tu clave.
   - **Nombre del modelo**: ej: `glm-5.2`, `gpt-4o-mini`, etc.
5. Escribe el **Prompt de sistema / contexto del negocio** (descripción de tu empresa, servicios, precios, horarios, tono).
6. Haz clic en **Probar conexión IA**.

> **Instrucción fija del sistema** (no editable): si el usuario pide hablar con un asesor, la IA responde `[ESCALAR_HUMANO]` y el backend activa el handoff automáticamente.

## Estructura del proyecto

```
lykos_chat/
├── backend/src/
│   ├── config/          # env, database, encryption (AES-256-GCM)
│   ├── migrations/      # Esquema SQL (001_init, 002_add_app_secret)
│   ├── models/          # Capa de datos (una por tabla)
│   ├── routes/          # Rutas Express (auth, config, webhook, conversaciones, ...)
│   ├── services/        # Lógica de negocio (whatsapp, ia, orquestador, flujos, handoff)
│   ├── middleware/      # Auth JWT + roles
│   ├── sockets/         # Socket.io (tiempo real)
│   ├── scripts/         # migrate.js, seed.js
│   ├── utils/           # logger
│   └── server.js        # Punto de entrada
├── public/              # Frontend (HTML + Tailwind + Alpine.js)
│   ├── index.html
│   ├── js/app.js        # Lógica Alpine
│   ├── js/api.js        # Helper de API
│   └── css/app.css
├── data/                # SQLite (se crea automáticamente)
├── .env.example
├── docker-compose.yml
└── package.json
```

## Esquema de base de datos

| Tabla | Descripción |
|---|---|
| `config_whatsapp` | Credenciales de WhatsApp (token y app secret cifrados) |
| `config_ia` | Configuración de IA (API key cifrada) |
| `config_bot` | Flujos/menús/palabras clave del bot |
| `usuarios` | Admin y agentes (JWT, bcrypt) |
| `contactos` | Personas que escriben por WhatsApp |
| `conversaciones` | Una por contacto (modo, estado, agente asignado) |
| `mensajes` | Historial (dirección, tipo, contenido, origen, status) |
| `uso_ia` | Registro de tokens IA por llamada |
| `eventos_procesados` | Deduplicación de eventos del webhook |
| `logs_api` | Errores de APIs para el panel |

## API REST (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (JWT) |
| GET/PUT | `/api/config/whatsapp` | Leer/guardar config WhatsApp |
| POST | `/api/config/whatsapp/test` | Probar conexión WhatsApp |
| GET/PUT | `/api/config/ia` | Leer/guardar config IA |
| POST | `/api/config/ia/test` | Probar conexión IA |
| GET/PUT | `/api/config/bot` | Leer/guardar flujos del bot |
| GET | `/webhook` | Verificación de Meta |
| POST | `/webhook` | Recepción de mensajes |
| GET | `/api/conversaciones` | Lista con filtros |
| GET | `/api/conversaciones/:id` | Detalle con mensajes |
| PUT | `/api/conversaciones/:id/modo` | Cambiar modo |
| POST | `/api/conversaciones/:id/mensajes` | Envío manual |
| GET | `/api/contactos` | CRUD contactos |
| GET | `/api/metricas` | Dashboard |
| GET/POST | `/api/usuarios` | Gestión de usuarios (admin) |

## Seguridad

- Tokens y API keys cifrados con **AES-256-GCM** en la base de datos.
- Firma del webhook validada con **HMAC-SHA256** (App Secret).
- **Rate limiting** en login (10 intentos / 15 min).
- Roles **admin** y **agente** con middleware de autorización.
- Cero credenciales en el código: todo desde el panel o variables de entorno.

## Ventana de 24 horas

WhatsApp solo permite enviar mensajes libres dentro de los 24 horas siguientes al último mensaje del usuario. El sistema:
- Renueva la ventana al recibir cada mensaje.
- Si expiró, el panel ofrece enviar una **plantilla** (template) para reabrir la conversación.

## Licencia

Uso libre. Desarrollado como software autoalojado.
