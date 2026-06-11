// POST /unsubscribe  { operatorId }
// Removes a stored subscription from Redis (Upstash or Vercel KV).

import { getRedis } from '../lib/redis.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured (check environment variables)' });
  }

  const { operatorId } = req.body || {};
  if (!operatorId) return res.status(400).json({ success: false, error: 'missing operatorId' });

  await redis.del('sub:' + operatorId);
  res.json({ success: true });
}
