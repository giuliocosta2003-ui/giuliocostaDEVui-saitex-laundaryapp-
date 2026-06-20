// POST /api/machine-telemetry
//
// Riceve i dati di stato dell'ESP32 sulla lavatrice e li scrive su Redis.
// Quando il payload contiene event = 'cycle_completed', invia anche una
// push notification a tutti i manager iscritti.
//
// Body atteso:
// {
//   "secret":   "<MACHINE_SECRET>",     // obbligatorio
//   "machineId":"lavatrice-01",         // identificatore macchina
//   "uptimeMs": 123456,
//   "water":  { "liters": 87, "online": true },
//   "motor":  { "running": true, "freqHz": 48.5, "statusRaw": 33, "online": true },
//   "levers": { "takeWater": false, "drain": false, "heat": true },
//   "buttons":{ "start": false, "stop": false },
//   "cycle":  { "state": "running", "elapsedMs": 8200, "lastDurationMs": 0 },
//   "event":  "cycle_completed"         // opzionale, solo a fine ciclo
// }

import webpush from 'web-push';
import { getRedis } from '../lib/redis.js';

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Chiave Redis: una entry per macchina, TTL 60s (se la macchina smette di
// inviare per piu di 60s, la consideriamo offline lato frontend)
const STATE_TTL_SECONDS = 60;
function stateKey(machineId) { return 'machine:state:' + machineId; }

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method not allowed' });
  }

  const MACHINE_SECRET = process.env.MACHINE_SECRET || '';
  const body = req.body || {};

  if (!MACHINE_SECRET) {
    return res.status(500).json({ success: false, error: 'MACHINE_SECRET non configurato lato server' });
  }
  if (body.secret !== MACHINE_SECRET) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis non configurato' });
  }

  const machineId = String(body.machineId || 'lavatrice-01');

  // Costruiamo lo stato canonico (rimuovendo il secret) + timestamp server
  const state = {
    machineId,
    receivedAt: Date.now(),
    uptimeMs:   body.uptimeMs || 0,
    water:      body.water    || null,
    motor:      body.motor    || null,
    levers:     body.levers   || null,
    buttons:    body.buttons  || null,
    cycle:      body.cycle    || null
  };

  try {
    // EX = expire seconds. Se la macchina si spegne, dopo 60s la chiave
    // sparisce e il frontend la vede "offline" automaticamente.
    await redis.set(stateKey(machineId), JSON.stringify(state), { ex: STATE_TTL_SECONDS });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'redis write failed: ' + e.message });
  }

  // Evento ciclo completato -> push notification ai manager
  let pushSent = 0;
  if (body.event === 'cycle_completed' && body.cycle) {
    const durSec = ((body.cycle.lastDurationMs || 0) / 1000).toFixed(1);
    pushSent = await pushToManagers(redis, {
      title: 'Lavatrice: ciclo completato',
      body:  'Macchina ' + machineId + ' - rotazione ' + durSec + ' s',
      tag:   'machine-cycle-' + machineId,
      url:   '/#machine'
    });
  }

  res.json({ success: true, machineId, pushSent });
}

// ---- helper: invia push a tutti i device iscritti come 'manager-1' ----
async function pushToManagers(redis, payload) {
  const id = 'manager-1';
  let deviceKeys = [];
  try { deviceKeys = await redis.keys('sub:' + id + ':*'); } catch (e) {}
  const legacyKey = 'sub:' + id;
  const allKeys = Array.from(new Set([...deviceKeys, legacyKey]));

  const targets = [];
  for (const key of allKeys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const sub = data && data.subscription ? data.subscription : data;
      if (sub && sub.endpoint) targets.push({ key, sub });
    } catch (e) {}
  }

  const seen = new Set();
  const unique = targets.filter(t => {
    if (seen.has(t.sub.endpoint)) return false;
    seen.add(t.sub.endpoint);
    return true;
  });

  const json = JSON.stringify(payload);
  let sent = 0;
  for (const { key, sub } of unique) {
    try {
      await webpush.sendNotification(sub, json);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await redis.del(key);
    }
  }
  return sent;
}
