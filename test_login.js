const { initDatabase, getDb } = require('./backend/src/config/database');
const bcrypt = require('bcryptjs');
const usuarioModel = require('./backend/src/models/usuario');

initDatabase();

const users = getDb().prepare('SELECT id, username, password_hash, activo FROM usuarios ORDER BY id').all();

console.log('=== Usuarios en BD ===');
for (const u of users) {
  console.log(`  id=${u.id} | username="${u.username}" | activo=${u.activo} | hash_len=${u.password_hash.length}`);
}

console.log('\n=== Prueba de findByUsername ===');
const testUsers = ['Prueba', 'User1', 'prueba', 'user1', 'PRUEBA', 'USER1'];
for (const username of testUsers) {
  const user = usuarioModel.findByUsername(username);
  console.log(`  findByUsername("${username}") => ${user ? 'ENCONTRADO (id=' + user.id + ')' : 'NO ENCONTRADO'}`);
}

console.log('\n=== Verificar bcrypt con "Prueba" ===');
const prueba = usuarioModel.findByUsername('Prueba');
if (prueba) {
  console.log('  Hash:', prueba.password_hash.slice(0, 20) + '...');
  const testPws = ['Prueba123', 'Prueba1a', 'prueba123', 'Password1', 'Admin123', 'Prueba12', 'Prueba1234'];
  for (const pw of testPws) {
    const ok = bcrypt.compareSync(pw, prueba.password_hash);
    console.log(`    bcrypt("${pw}") => ${ok ? 'MATCH' : 'no'}`);
  }
} else {
  console.log('  Prueba NO encontrada');
}
