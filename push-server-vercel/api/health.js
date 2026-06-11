// GET /health -> simple uptime/configuration check

import { redisCreds } from '../lib/redis.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { url, token } = redisCreds();
  res.json({
    ok: true,
    time: new Date().toISOString(),
    vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    redisConfigured: !!(url && token)
  });
}
