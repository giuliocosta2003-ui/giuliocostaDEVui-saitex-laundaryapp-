// GET /photo/{id}
// Serves a photo previously stored via POST /upload-photo. Public (no
// secret) — the URL itself (a random id) is the access token, same as any
// shared-image link. Returns the raw image bytes with the right
// Content-Type so it can be used directly as an <img src="...">.

import { getRedis } from '../../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'method not allowed' });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ success: false, error: 'redis not configured (check environment variables)' });
  }

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ success: false, error: 'missing id' });

  const raw = await redis.get('photo:' + id);
  if (!raw) return res.status(404).send('Not found');

  let record;
  try {
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return res.status(500).send('Corrupt photo record');
  }

  if (!record || !record.data) return res.status(404).send('Not found');

  const buffer = Buffer.from(record.data, 'base64');
  res.setHeader('Content-Type', record.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
  res.status(200).send(buffer);
}
