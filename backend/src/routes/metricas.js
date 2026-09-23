// ============================================================
//  Rutas: /api/metricas (Módulo 6 - dashboard)
//  Conversaciones hoy, mensajes enviados/recibidos,
//  % resueltas por flujos vs IA vs humano, tokens IA por dia
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../config/database');
const usoIaModel = require('../models/usoIA');

// GET /api/metricas -> resumen del dashboard (admin only)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();

  // Conversaciones hoy.
  const convHoy = db.prepare(
    `SELECT COUNT(*) as n FROM conversaciones WHERE date(created_at) = date('now')`
  ).get().n;

  // Conversaciones activas totales.
  const convActivas = db.prepare(
    `SELECT COUNT(*) as n FROM conversaciones WHERE estado = 'activa'`
  ).get().n;

  // Mensajes enviados y recibidos hoy.
  const enviadosHoy = db.prepare(
    `SELECT COUNT(*) as n FROM mensajes WHERE direccion = 'out' AND date(timestamp) = date('now')`
  ).get().n;
  const recibidosHoy = db.prepare(
    `SELECT COUNT(*) as n FROM mensajes WHERE direccion = 'in' AND date(timestamp) = date('now')`
  ).get().n;

  // Distribucion por modo (origen de respuestas).
  const porOrigen = db.prepare(`
    SELECT origen, COUNT(*) as n FROM mensajes
    WHERE direccion = 'out' AND date(timestamp) = date('now')
    GROUP BY origen
  `).all();
  const distribucion = {
    bot: 0, ia: 0, humano: 0, sistema: 0,
  };
  porOrigen.forEach(r => { distribucion[r.origen] = r.n; });
  const totalOut = (distribucion.bot + distribucion.ia + distribucion.humano) || 1;
  const porcentajes = {
    bot: Math.round((distribucion.bot / totalOut) * 100),
    ia: Math.round((distribucion.ia / totalOut) * 100),
    humano: Math.round((distribucion.humano / totalOut) * 100),
  };

  // Conversaciones por modo actual.
  const porModo = db.prepare(`
    SELECT modo, COUNT(*) as n FROM conversaciones WHERE estado = 'activa' GROUP BY modo
  `).all();
  const modos = { bot: 0, ia: 0, humano: 0 };
  porModo.forEach(r => { modos[r.modo] = r.n; });

  // Tokens IA por dia (ultimos 7 dias).
  const tokens = usoIaModel.tokensPorDia(7);

  // Total tokens hoy.
  const tokensHoy = db.prepare(
    `SELECT COALESCE(SUM(total_tokens),0) as t FROM uso_ia WHERE date(fecha) = date('now')`
  ).get().t;

  // Conversaciones pendientes (esperando agente).
  const pendientes = db.prepare(
    `SELECT COUNT(*) as n FROM conversaciones WHERE estado = 'pendiente'`
  ).get().n;

  res.json({
    conversaciones_hoy: convHoy,
    conversaciones_activas: convActivas,
    conversaciones_pendientes: pendientes,
    mensajes_enviados_hoy: enviadosHoy,
    mensajes_recibidos_hoy: recibidosHoy,
    distribucion_origen: distribucion,
    porcentajes,
    conversaciones_por_modo: modos,
    tokens_ia_hoy: tokensHoy,
    tokens_ia_por_dia: tokens,
  });
});

module.exports = router;
