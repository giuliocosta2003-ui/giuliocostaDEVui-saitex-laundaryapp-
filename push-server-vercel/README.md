# Saitex Push Server (Vercel edition)

A small set of Vercel serverless functions that send Web Push notifications
using [`web-push`](https://github.com/web-push-libs/web-push) (VAPID
protocol), with subscriptions stored in [Upstash Redis](https://upstash.com)
(free tier, no credit card required).

It is **completely independent** from Google Apps Script / the Google Sheet.
The Saitex tracker (`index.html`) talks to this server directly from the
browser to register devices and trigger notifications.

Endpoints (after the `vercel.json` rewrites): `/subscribe`, `/unsubscribe`,
`/send`, `/health` — same shape as before, so `index.html` doesn't need any
changes beyond the config block.

---

## 1. Generate VAPID keys

No project install needed — `npx` fetches the tool temporarily:

```bash
npx web-push generate-vapid-keys
```

This prints something like:

```
=======================================

Public Key:
BBs3I...long string...

Private Key:
cR3et...long string...

=======================================
```

Save both — you'll need them in steps 3 and 5.

---

## 2. Pick a `PUSH_SECRET`

```bash
openssl rand -hex 24
```

Save the output — you'll need it in steps 3 and 5.

---

## 3. Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign up (free, no credit card).
2. Push this `push-server-vercel/` folder to a GitHub repo (can be private).
3. On Vercel: **Add New → Project** → import the repo → set the **Root
   Directory** to `push-server-vercel` if your repo contains other folders too.
4. Don't deploy yet — first add storage (next step). Or deploy now and redeploy
   after — either order works.

---

## 4. Add Upstash Redis (storage for subscriptions)

Easiest path — Vercel's built-in integration:

1. In your Vercel project, go to the **Storage** tab.
2. **Create Database → Upstash → Redis** (or "Marketplace Database Providers"
   depending on the current UI wording).
3. Choose the free plan, create it, and **connect it to your project**.

This automatically sets `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` as environment variables on your project — no
manual copying needed.

(Alternative: create a free database directly at
[upstash.com](https://upstash.com) and manually copy the REST URL/token into
your Vercel project's environment variables — same result.)

---

## 5. Set the remaining environment variables

In your Vercel project: **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | from step 1 |
| `VAPID_PRIVATE_KEY` | from step 1 |
| `VAPID_CONTACT_EMAIL` | your email, e.g. `you@example.com` |
| `PUSH_SECRET` | from step 2 |

Apply to **Production** (and Preview/Development if you'll test those).

---

## 6. Deploy

If you connected via GitHub, Vercel deploys automatically on push. Or use the
CLI:

```bash
cd push-server-vercel
npm i -g vercel     # if you don't have it
vercel --prod
```

---

## 7. Verify it's alive

Vercel gives you a URL like `https://your-project.vercel.app`. Test:

```bash
curl https://your-project.vercel.app/health
```

Expected:
```json
{"ok":true,"time":"...","vapidConfigured":true,"redisConfigured":true}
```

If `vapidConfigured` or `redisConfigured` is `false`, double-check the
environment variables in step 5 and that you redeployed after setting them.

---

## 8. Wire it into `index.html`

Open `index.html`, find the `PUSH NOTIFICATIONS` config block near the top of
the `<script>` section, and set:

```javascript
const PUSH_SERVER_URL = 'https://your-project.vercel.app';  // no trailing slash
const VAPID_PUBLIC_KEY  = 'BBs3I...';                         // same as step 1
const PUSH_SECRET       = 'the-random-string-from-step-2';   // same as step 2
```

> **Heads-up on `PUSH_SECRET`**: this value lives in the page's source code,
> same as `MANAGER_PIN`. Anyone who views the page source can read it. For an
> internal tool this is an acceptable trade-off (it just gates who can trigger
> a notification to your operator's phone) — it is *not* a real secret.

---

## 9. Upload to your hosting

Upload the updated `index.html`, plus `sw.js` and `manifest.json`, to the
**same root folder** of your existing hosting. All three must sit at the same
level (not in a subfolder).

---

## 10. Install the PWA and enable notifications

1. On the operator's iPhone, open the site in **Safari** (not Chrome).
2. Tap **Share → Add to Home Screen**.
3. Open the app from the new home screen icon.
4. Go to the **Operator** view.
5. Tap the blue **"🔔 Enable notifications"** banner and allow when prompted.

---

## 11. Test

From the **Manager** view, pin a sample or send a manager message. Lock the
operator's phone — within a few seconds a push notification should appear.

---

## iOS reminder

Web Push to an iPhone only works with **iOS 16.4+**, the app **installed via
"Add to Home Screen"**, and notifications **explicitly enabled**. This is an
Apple platform requirement independent of Vercel/Fly/any push library.

---

## Notes on Vercel free tier

- No time-limited trial — the Hobby plan is free indefinitely for personal/
  small projects, with generous monthly request limits far beyond what a
  single-operator tracker needs.
- Functions are stateless/serverless — that's why subscriptions live in
  Upstash Redis rather than a local file. Upstash's free tier (10,000
  commands/day, 256MB) is far more than enough here.
- Cold starts are typically sub-second for small functions like these.

---

## Local development (optional)

```bash
npm install
vercel dev
```

This runs the functions locally (reads `.env.local` — copy `.env.example` to
`.env.local` and fill in values, including the Upstash REST credentials from
your dashboard).
