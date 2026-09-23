// ============================================================
//  PM2 - Ecosystem config para Lykos Chat
//  Uso: pm2 start ecosystem.config.js
//  Save: pm2 save && pm2 startup
// ============================================================
module.exports = {
  apps: [{
    name: 'lykos-chat',
    script: 'backend/src/server.js',
    node_args: '--experimental-sqlite',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true,
    time: true,
  }],
};
