// ============================================================
//  Script: seed - crea el admin inicial y filas singleton de config
// ============================================================
const { initDatabase, getDb } = require('../config/database');
const env = require('../config/env');
const usuarioModel = require('../models/usuario');
const logger = require('../utils/logger');

console.log('Inicializando BD...');
initDatabase();

// --- Admin inicial ---
const existing = getDb().prepare('SELECT 1 FROM usuarios WHERE username = ?').get(env.ADMIN_USERNAME);
if (!existing) {
  usuarioModel.create({
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    role: 'admin',
    nombre: 'Administrador',
  });
  console.log(`Admin creado: ${env.ADMIN_USERNAME} / ${env.ADMIN_PASSWORD}`);
} else {
  console.log(`Admin "${env.ADMIN_USERNAME}" ya existe, se omite.`);
}

// --- Filas singleton de configuracion ---
const db = getDb();
for (const t of ['config_whatsapp', 'config_ia', 'config_bot']) {
  const has = db.prepare(`SELECT 1 FROM ${t} WHERE id = 1`).get();
  if (!has) db.prepare(`INSERT INTO ${t} (id) VALUES (1)`).run();
}

// Verify token inicial desde env si la columna esta vacia.
const cw = db.prepare('SELECT verify_token FROM config_whatsapp WHERE id = 1').get();
if (!cw.verify_token) {
  db.prepare('UPDATE config_whatsapp SET verify_token = ?, public_url = ? WHERE id = 1')
    .run(env.WEBHOOK_VERIFY_TOKEN, env.PUBLIC_URL);
}

console.log('Seed completado.');
process.exit(0);
