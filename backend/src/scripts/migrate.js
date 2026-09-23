// ============================================================
//  Script: aplicar migraciones SQL (npm run migrate)
// ============================================================
const { initDatabase, getDb } = require('../config/database');

console.log('Aplicando migraciones...');
initDatabase();
const tables = getDb().prepare(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
).all().map(r => r.name);
console.log('Tablas creadas:', tables.join(', '));
console.log('Migracion completada.');
process.exit(0);
