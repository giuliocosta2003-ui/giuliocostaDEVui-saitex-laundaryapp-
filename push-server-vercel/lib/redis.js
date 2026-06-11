// Shared Redis client builder.
//
// Vercel's Upstash/KV integration sometimes sets UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN, and sometimes (newer "Vercel KV" branding)
// KV_REST_API_URL / KV_REST_API_TOKEN instead — both point at the same kind
// of Upstash Redis REST endpoint, just different env var names depending on
// how the integration was set up. This helper accepts either.

import { Redis } from '@upstash/redis';

export function redisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return { url, token };
}

export function getRedis() {
  const { url, token } = redisCreds();
  if (!url || !token) return null;
  return new Redis({ url, token });
}
