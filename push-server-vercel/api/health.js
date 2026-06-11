// GET /health -> simple uptime/configuration check
// TEMPORARY: also lists which env var NAMES (not values) related to
// Redis/KV/VAPID are visible to this function, to debug configuration.

import { redisCreds } from '../lib/redis.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { url, token } = redisCreds();

  var relevantKeys = Object.keys(process.env).filter(function(k){
    return k.indexOf('REDIS') !== -1 || k.indexOf('KV_') !== -1 || k.indexOf('VAPID') !== -1 || k.indexOf('PUSH_SECRET') !== -1;
  }).sort();

  res.json({
    ok: true,
    time: new Date().toISOString(),
    vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    redisConfigured: !!(url && token),
    debug_envKeysFound: relevantKeys
  });
}
