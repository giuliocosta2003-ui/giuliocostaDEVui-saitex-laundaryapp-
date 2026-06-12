// POST /subscribe  { operatorId, deviceId, label, subscription }
// Stores the subscription in Redis (Upstash or Vercel KV), keyed by
// operatorId AND deviceId — so the same role (e.g. "manager-1") can have
// multiple devices subscribed at once (PC + phone) without overwriting
// each other. deviceId is a random id the app generates once and keeps in
// localStorage. label is a free-text name the person typed at login (e.g.
// "Mai"), stored alongside the subscription so devices can be told apart.

import { getRedis } from '../lib/redis.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitizeDeviceId(raw) {
  var s = String(raw || 'default').replace(/[^A-Za-z0-9_-]/g, '');
  if (!s) s = 'default';
  return s.slice(0, 64);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured (check environment variables)' });
  }

  const { operatorId, deviceId, label, subscription } = req.body || {};
  if (!operatorId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'missing operatorId or subscription' });
  }

  const did = sanitizeDeviceId(deviceId);
  const record = {
    subscription: subscription,
    label: (label || '').toString().slice(0, 60),
    updatedAt: Date.now()
  };
  await redis.set('sub:' + operatorId + ':' + did, JSON.stringify(record));
  res.json({ success: true });
}
