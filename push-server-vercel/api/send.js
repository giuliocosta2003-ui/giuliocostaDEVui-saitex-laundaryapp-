// POST /send  { secret, operatorId?, title, body, url?, tag? }
// Sends a Web Push notification (VAPID, via web-push) to EVERY device
// subscribed under this operatorId/role — e.g. if "manager-1" has both a
// PC and a phone subscribed, both receive it.

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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured (check environment variables)' });
  }

  const { secret, operatorId, title, body, url, tag } = req.body || {};
  const PUSH_SECRET = process.env.PUSH_SECRET || '';

  if (PUSH_SECRET && secret !== PUSH_SECRET) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  const id = operatorId || 'operator-1';

  // New format: one key per device, "sub:{id}:{deviceId}"
  let deviceKeys = [];
  try {
    deviceKeys = await redis.keys('sub:' + id + ':*');
  } catch (e) {
    deviceKeys = [];
  }

  // Old format: a single key "sub:{id}" (kept for subscriptions created
  // before per-device keys existed)
  const legacyKey = 'sub:' + id;
  const allKeys = Array.from(new Set([...deviceKeys, legacyKey]));

  const entries = [];
  for (const key of allKeys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;
      entries.push({ key, sub });
    } catch (e) {
      // ignore malformed entries
    }
  }

  // De-dupe by endpoint — the same device could in theory appear under
  // both the legacy key and a per-device key.
  const seen = new Set();
  const targets = entries.filter(function (e) {
    const ep = e.sub && e.sub.endpoint;
    if (!ep || seen.has(ep)) return false;
    seen.add(ep);
    return true;
  });

  if (!targets.length) {
    return res.json({ success: true, sent: 0, note: 'no subscriptions registered for ' + id });
  }

  const payload = JSON.stringify({
    title: title || 'Saitex Laundry',
    body: body || '',
    url: url || '/',
    tag: tag || 'saitex'
  });

  const results = [];
  for (const { key, sub } of targets) {
    try {
      await webpush.sendNotification(sub, payload);
      results.push({ key, success: true });
    } catch (err) {
      results.push({ key, success: false, error: err.message, statusCode: err.statusCode || null });
      // 404/410 = this device's subscription is gone — clean it up
      if (err.statusCode === 404 || err.statusCode === 410) {
        await redis.del(key);
      }
    }
  }

  res.json({ success: true, sent: results.filter(function (r) { return r.success; }).length, results });
}
