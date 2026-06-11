// POST /send  { secret, operatorId?, title, body, url?, tag? }
// Looks up the stored subscription(s) in Redis (Upstash or Vercel KV) and
// sends a Web Push notification via web-push (VAPID).

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
  const raw = await redis.get('sub:' + id);
  if (!raw) {
    return res.json({ success: true, sent: 0, note: 'no subscription registered for ' + id });
  }
  const subscription = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const payload = JSON.stringify({
    title: title || 'Saitex Laundry',
    body: body || '',
    url: url || '/',
    tag: tag || 'saitex'
  });

  try {
    await webpush.sendNotification(subscription, payload);
    res.json({ success: true, sent: 1 });
  } catch (err) {
    // 404/410 = the subscription is gone (uninstalled, expired) — clean it up
    if (err.statusCode === 404 || err.statusCode === 410) {
      await redis.del('sub:' + id);
    }
    res.json({ success: false, error: err.message, statusCode: err.statusCode || null });
  }
}
