// ============================================================
//  Conexion a SQLite (better-sqlite3) y aplicacion de migraciones
// ============================================================
const path = require('path');
const fs = require('fs');
// Usamos el modulo SQLite integrado en Node 22+ (node:sqlite).
// Es sincrono y con API compatible con better-sqlite3 (sin compilacion nativa).
const Database = require('node:sqlite').DatabaseSync;
const env = require('./env');

let db = null;

// Inicializa la BD, crea el directorio si no existe y aplica migraciones SQL.
function initDatabase() {
  const dbPath = path.resolve(process.cwd(), env.DB_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  // node:sqlite no tiene metodo .pragma(); usamos exec directamente.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Tabla de control de migraciones aplicadas (idempotente).
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))`);

  // Aplica migraciones .sql en orden alfabetico, solo si no fueron aplicadas.
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    const isApplied = db.prepare('SELECT 1 FROM _migrations WHERE name = ?');
    const markApplied = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
    for (const file of files) {
      if (isApplied.get(file)) continue; // ya aplicada
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec(sql);
      markApplied.run(file);
    }
  }

  return db;
}

// Devuelve la instancia activa (lanza si no se ha inicializado).
function getDb() {
  if (!db) throw new Error('BD no inicializada. Llama initDatabase() primero.');
  return db;
}

module.exports = { initDatabase, getDb };
