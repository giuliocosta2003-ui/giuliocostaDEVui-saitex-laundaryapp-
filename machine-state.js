// GET /api/machine-state?machineId=lavatrice-01
//
// Restituisce lo stato corrente della lavatrice salvato su Redis.
// Letto in polling dal frontend (PWA su Netlify).
// Se non c'e stato recente (la chiave Redis e' scaduta), torna online=false.

import { getRedis } from '../lib/redis.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Disabilita la cache CDN/browser: vogliamo sempre lo stato fresco
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function stateKey(machineId) { return 'machine:state:' + machineId; }

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'method not allowed' });
  }

  const machineId = String(req.query.machineId || 'lavatrice-01');

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis non configurato' });
  }

  try {
    const raw = await redis.get(stateKey(machineId));
    if (!raw) {
      return res.json({ success: true, machineId, online: false, state: null });
    }
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Considera online se ricevuto stato negli ultimi 15s (3x periodo push)
    const ageMs = Date.now() - (state.receivedAt || 0);
    const online = ageMs < 15000;

    return res.json({ success: true, machineId, online, ageMs, state });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'redis read failed: ' + e.message });
  }
}
