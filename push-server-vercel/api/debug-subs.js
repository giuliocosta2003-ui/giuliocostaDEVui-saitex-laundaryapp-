// TEMPORARY DEBUG ENDPOINT — GET /debug-subs
// Lists every "sub:*" key in Redis with just enough info to tell devices
// apart: the push service hostname (web.push.apple.com = Apple/Safari,
// fcm.googleapis.com = Chrome/Edge/Android, etc.) and the last 12
// characters of the subscription endpoint (a stable "fingerprint" you can
// compare across keys without exposing the full endpoint URL).
//
// Remove this file (and its line in vercel.json) once you're done
// identifying devices — it doesn't require the PUSH_SECRET, so don't leave
// it deployed long-term.

import { getRedis } from '../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured' });
  }

  let keys = [];
  try {
    keys = await redis.keys('sub:*');
  } catch (e) {
    keys = [];
  }

  const out = [];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const sub = data && data.subscription ? data.subscription : data;
      const label = data && data.subscription ? (data.label || '') : '';
      const endpoint = (sub && sub.endpoint) || '';
      let host = '';
      try { host = new URL(endpoint).hostname; } catch (e) {}
      out.push({
        key,
        label,
        host,
        endpointTail: endpoint.slice(-12)
      });
    } catch (e) {
      out.push({ key, error: 'unreadable' });
    }
  }

  out.sort((a, b) => a.key.localeCompare(b.key));
  res.json({ success: true, count: out.length, subscriptions: out });
}
