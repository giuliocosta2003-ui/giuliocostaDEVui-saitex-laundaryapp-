// POST /upload-photo  { secret, image }
// image must be a base64 data URL: "data:image/jpeg;base64,...."
// Stores the photo in Redis (90-day TTL) and returns a URL that serves it
// back via GET /photo/{id}. Used for photos attached to manager messages —
// the message itself (saved via Apps Script) only stores this small URL.

import { getRedis } from '../lib/redis.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 90 days — generous for "instructions attached to a message", but not
// forever, so old photos eventually fall out of Redis on their own.
const PHOTO_TTL_SECONDS = 60 * 60 * 24 * 90;

// Cap on the base64 payload itself (~2MB). The client compresses images to
// well under this before uploading; this is just a backstop.
const MAX_BASE64_LENGTH = 2 * 1024 * 1024;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured (check environment variables)' });
  }

  const { secret, image } = req.body || {};
  const PUSH_SECRET = process.env.PUSH_SECRET || '';
  if (PUSH_SECRET && secret !== PUSH_SECRET) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ success: false, error: 'missing image' });
  }

  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ success: false, error: 'expected a base64 data URL (data:image/...;base64,...)' });
  }

  const mimeType = match[1];
  const base64Data = match[2];

  if (base64Data.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ success: false, error: 'image too large' });
  }

  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const record = { mimeType, data: base64Data, createdAt: Date.now() };

  await redis.set('photo:' + id, JSON.stringify(record), { ex: PHOTO_TTL_SECONDS });

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = proto + '://' + host + '/photo/' + id;

  res.json({ success: true, id, url });
}
