// POST /unsubscribe  { operatorId, deviceId }
// Removes a single device's subscription from Redis (Upstash or Vercel KV).

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

  const { operatorId, deviceId } = req.body || {};
  if (!operatorId) return res.status(400).json({ success: false, error: 'missing operatorId' });

  const did = sanitizeDeviceId(deviceId);
  await redis.del('sub:' + operatorId + ':' + did);
  res.json({ success: true });
}
