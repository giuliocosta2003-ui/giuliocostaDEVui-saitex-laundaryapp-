# Saitex Laundry Tracker

A single-page web app for tracking wash samples at Saitex Mill, with a
manager view and an operator view, backed by a Google Sheet.

## Project structure

```
saitex-laundry-tracker/
├── index.html              ← the app itself (Manager + Operator views)
├── sw.js                    ← service worker (enables push notifications)
├── manifest.json            ← PWA manifest (enables "Add to Home Screen")
├── Codice.gs                ← Google Apps Script backend (paste into the
│                               Google Sheet's Script Editor)
└── push-server-vercel/      ← optional: push notification server
    ├── api/
    │   ├── subscribe.js
    │   ├── unsubscribe.js
    │   ├── send.js
    │   └── health.js
    ├── package.json
    ├── vercel.json
    ├── .env.example
    ├── .gitignore
    └── README.md            ← full deployment walkthrough
```

## Deployment overview

1. **Google Sheet + Apps Script**
   - Open your Google Sheet → Extensions → Apps Script.
   - Paste the contents of `Codice.gs`.
   - Deploy as a Web App (Deploy → Manage deployments → New version after any
     change to keep the URL stable).
   - Copy the resulting `/exec` URL into `index.html`'s `SCRIPT_URL` constant.

2. **Hosting the app**
   - Upload `index.html`, `sw.js`, and `manifest.json` to your static hosting,
     all three at the **same root level** (not in subfolders).

3. **Push notifications (optional)**
   - Follow `push-server-vercel/README.md` to deploy the push server on
     Vercel (free) with Upstash Redis for storage.
   - Fill in `PUSH_SERVER_URL`, `VAPID_PUBLIC_KEY`, and `PUSH_SECRET` in
     `index.html`'s `PUSH NOTIFICATIONS` config block.
   - If you don't want push notifications, leave `PUSH_SERVER_URL` empty —
     everything else works normally without it.

## Before going live

- Change `MANAGER_PIN` in `index.html` from the default `1234`.
- Make sure the Google Sheet's `🟢 TRACKER` tab columns match what
  `Codice.gs` expects (see comments in `getCols()`).
- On the operator's iPhone: open the site in Safari → Share → Add to Home
  Screen → open from the new icon → enable notifications from the Operator
  view (requires iOS 16.4+).
