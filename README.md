# SAITEX Laundry Tracker

Real-time sample tracking and industrial washing machine monitoring for textile production.

---

## Overview

SAITEX Laundry Tracker is a Progressive Web App (PWA) that combines two systems:

1. **Sample Tracker** — tracks laundry samples through the production workflow (Pending → In Progress → Completed → Blocked), backed by Google Sheets via Apps Script.
2. **Machine Monitor** — live monitoring of the industrial washing machine via an ESP32 microcontroller, with real-time 3D visualization, lever/button status, motor state, water level, and cycle timing.

---

## Architecture

```
┌─────────────────┐     RS-232 Modbus     ┌─────────────────┐
│  EMKO EZM-4950  │ ◄──────────────────── │                 │
│  (water level)  │                        │   ESP32 DevKit  │
└─────────────────┘                        │   (lavatrice)   │
                                           │                 │
┌─────────────────┐     RS-485 Modbus     │                 │
│  Omron 3G3RV    │ ◄──────────────────── │                 │
│  (motor/VFD)    │                        │                 │
└─────────────────┘                        └────────┬────────┘
                                                    │ HTTPS POST
                                                    │ every 5s
┌─────────────────┐     Netlify (PWA)     ┌────────▼────────┐
│   Google Sheets │ ◄──── Apps Script ─── │  Vercel API     │
│   (samples DB)  │                        │  + Upstash Redis│
└─────────────────┘                        └────────┬────────┘
                                                    │ GET /api/machine-state
                                           ┌────────▼────────┐
                                           │  PWA Frontend   │
                                           │  sai-tex-washing│
                                           │  tracker.netlify│
                                           └─────────────────┘
```

---

## Repository Structure

```
/
├── index.html                  ← PWA frontend (Netlify)
├── lavatrice_1.glb             ← 3D washing machine model (Three.js)
├── manifest.json               ← PWA manifest
├── sw.js                       ← Service worker
├── icon-192.png
├── icon-512.png
├── Codice.gs                   ← Google Apps Script backend
├── push-server-vercel/         ← Vercel backend
│   ├── api/
│   │   ├── subscribe.js        ← Push notification subscribe
│   │   ├── unsubscribe.js      ← Push notification unsubscribe
│   │   ├── send.js             ← Send push to subscribers
│   │   ├── health.js           ← Health check
│   │   ├── debug-subs.js       ← Debug subscriptions
│   │   ├── upload-photo.js     ← Photo upload
│   │   ├── machine-state.js    ← GET current machine state (from Redis)
│   │   └── machine-telemetry.js← POST telemetry from ESP32
│   ├── lib/
│   │   └── redis.js            ← Upstash Redis client
│   ├── package.json
│   └── vercel.json
├── firmware/
│   └── lavatrice_firmware_v3.ino ← ESP32 firmware
└── README.md
```

---

## Hardware (ESP32 Machine Monitor)

### Components

| Component | Description |
|-----------|-------------|
| ESP32 DevKit v1 (30 pin) | Main microcontroller |
| EMKO EZM-4950 | Water level counter (impulse → litres) |
| Omron 3G3RV-A4075 | 7.5kW VFD / inverter for drum motor |
| HW-027 MAX3232 module | RS-232 converter (EMKO) |
| JINTENGFA MAX3485 module | RS-485 converter (Omron) |
| PC817 4-channel opto (24V) | Lever inputs isolation |
| Opto module 220V AC | START/STOP button isolation |
| USB-C 5V DIN PSU | ESP32 power supply (DIN rail) |

### Pin Mapping

| GPIO | Connected to | Type |
|------|-------------|------|
| 32 | HW-027 MAX3232 TXD (lato TTL) | Serial1 RX (EMKO) |
| 33 | HW-027 MAX3232 RXD (lato TTL) | Serial1 TX (EMKO) |
| 16 | MAX3485 TXD | Serial2 RX (Omron) |
| 17 | MAX3485 RXD | Serial2 TX (Omron) |
| 18 | Opto V1 — Lever 1 Left (Take Water) | INPUT_PULLUP |
| 19 | Opto V2 — Lever 1 Right (Drain) | INPUT_PULLUP |
| 21 | Opto V3 — Lever 2 Right (Heat) | INPUT_PULLUP |
| 22 | Opto 220V — START button | INPUT_PULLUP |
| 23 | Opto 220V — STOP button | INPUT_PULLUP |
| 2  | Onboard LED (WiFi heartbeat) | OUTPUT |

### Wiring Notes

**RS-485 (Omron side)**
- Bridge R+ ↔ S+ → connect to A (D+) on MAX3485
- Bridge R− ↔ S− → connect to B (D−) on MAX3485
- DIP switch S1-1 = ON (inserts 110Ω termination)

**RS-232 (EMKO side) — HW-027 module**
- EMKO TXD → HW-027 RS232 RXD
- EMKO RXD → HW-027 RS232 TXD
- HW-027 TTL TXD → ESP32 GPIO 32 (RX1)
- HW-027 TTL RXD → ESP32 GPIO 33 (TX1)
- VCC → 3.3V from ESP32

**24V Opto (levers) — PC817 4-channel board**
- Remove all 4 red jumpers before wiring (maintains galvanic isolation)
- +24V → COM of both levers
- Each NO contact → INx of opto module
- −24V → G (input side of opto)
- Vx → GPIO (output side)
- G (output side) → GND of ESP32
- ⚠️ −24V and ESP32 GND must NEVER be connected together

### Omron Inverter Parameters (MEMOBUS)

Set these via the digital operator panel (PRGM mode):

| Parameter | Value | Description |
|-----------|-------|-------------|
| H5-01 | 01 | Slave ID |
| H5-02 | 3 | Baud rate 9600 |
| H5-03 | 0 | Parity None (8N1) |
| H5-06 | 5 | Send delay 5ms |
| H5-07 | 1 | RTS Enable (2-wire RS-485) |

⚠️ Power cycle the inverter after any H5 change.

---

## Firmware Setup

### Requirements

- Arduino IDE 2.x
- Board: `esp32 by Espressif Systems` (Board Manager)
- Libraries: `ModbusMaster` (Doc Walker), `ArduinoJson` v6 (Benoit Blanchon)

### Configuration

Open `firmware/lavatrice_firmware_v3.ino` and edit the constants at the top:

```cpp
const char* WIFI_SSID      = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD  = "YOUR_WIFI_PASSWORD";
const char* TELEMETRY_URL  = "https://YOUR-PROJECT.vercel.app/api/machine-telemetry";
const char* MACHINE_SECRET = "YOUR_SECRET";   // openssl rand -hex 32
const char* MACHINE_ID     = "lavatrice-01";
const char* OTA_PASSWORD   = "YOUR_OTA_PASSWORD";
const char* OTA_HOSTNAME   = "lavatrice-01";
```

### First Flash (USB-C cable)

1. Connect ESP32 via USB-C
2. Tools → Board → ESP32 Dev Module
3. Tools → Port → select USB port
4. Upload → hold BOOT button if needed

### Subsequent Updates (OTA via WiFi)

After first flash, all future updates go over WiFi:
1. Tools → Port → select `lavatrice-01 at 192.168.x.x (ESP32)`
2. Upload → enter OTA password when prompted

### Debug via Telnet

```bash
telnet 192.168.x.x 23       # Mac/Linux
nc 192.168.x.x 23           # alternative
```
Or use **Termius** app on iPhone. Full serial log streamed over WiFi — no USB cable needed.

### Progressive Testing Plan

Test one component at a time. Comment out Modbus in `setup()` and `loop()` until each phase passes:

| Phase | What you test | Modbus status |
|-------|--------------|---------------|
| 1 | 24V levers + WiFi + Vercel + PWA card | Commented out |
| 2 | 220V START/STOP buttons | Commented out |
| 3 | EMKO EZM-4950 water level | Serial2 only commented |
| 4 | Omron 3G3RV motor state | All active |
| 5 | Full integrated test | All active |

---

## Vercel Backend Setup

### New Endpoints

Two new files added to `push-server-vercel/api/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/machine-telemetry` | POST | Receives ESP32 telemetry, writes to Redis |
| `/api/machine-state` | GET | Returns current machine state to frontend |

### Environment Variables (Vercel Dashboard)

Add under Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `MACHINE_SECRET` | Shared secret between ESP32 and Vercel. Generate with `openssl rand -hex 32`. Must match the firmware constant. |
| `VAPID_PUBLIC_KEY` | Already configured |
| `VAPID_PRIVATE_KEY` | Already configured |
| `KV_REST_API_URL` | Already configured (Upstash Redis) |
| `KV_REST_API_TOKEN` | Already configured (Upstash Redis) |

### Deploy

```bash
git add push-server-vercel/api/machine-state.js
git add push-server-vercel/api/machine-telemetry.js
git commit -m "feat: add machine telemetry endpoints"
git push
# Vercel deploys automatically
```

### Verify

```bash
# Should return online:false (no ESP32 yet)
curl https://YOUR-PROJECT.vercel.app/api/machine-state?machineId=lavatrice-01

# Simulate ESP32 POST
curl -X POST https://YOUR-PROJECT.vercel.app/api/machine-telemetry \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SECRET","machineId":"lavatrice-01","levers":{"takeWater":true}}'

# Should now return online:true
curl https://YOUR-PROJECT.vercel.app/api/machine-state?machineId=lavatrice-01
```

---

## Netlify Frontend Setup

### Files Required in Repo Root

| File | Description |
|------|-------------|
| `index.html` | Full PWA with Laundry panel integrated |
| `lavatrice_1.glb` | 3D washing machine model for Three.js |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker |

### Laundry Panel

The machine monitor is accessible via **Tools → 🫧 Laundry** in the app header. It shows:
- Live 3D washing machine model with animated water shader
- Water level (litres from EMKO)
- Motor state and frequency (from Omron VFD)
- Cycle state and elapsed time
- Live flags for all levers and buttons (Take Water, Drain, Heat, Start, Stop)
- Last rotation duration

The panel polls `/api/machine-state` on Vercel every 3 seconds using the existing `PUSH_SERVER_URL` constant already defined in the app.

---

## How It Works

1. **ESP32** reads levers, buttons, water level (EMKO via RS-232 Modbus), and motor state (Omron via RS-485 Modbus) every 200–500ms.
2. Every 5 seconds, ESP32 POSTs a JSON telemetry payload to `/api/machine-telemetry` on Vercel with a shared secret.
3. Vercel writes the state to **Upstash Redis** with a 60-second TTL. If the ESP32 goes silent, the key expires and the frontend shows "offline" automatically.
4. The PWA polls `/api/machine-state` every 3 seconds and updates the Laundry panel in real time.
5. When the drum stops (motor running → stopped), the ESP32 calculates cycle duration and sends a `cycle_completed` event, which triggers a **push notification** to all subscribed manager devices.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `err 0xE2` on OMRON | Cables R+/R− swapped, or H5-07=0 | Check wiring and H5 params |
| `err 0xE0` (CRC error) | EMI noise / missing termination | Verify S1-1=ON, shielded cable |
| `POST 401` from Vercel | MACHINE_SECRET mismatch | Same value in firmware and Vercel env vars |
| `POST 404` from Vercel | Endpoints not deployed | Push `machine-state.js` and `machine-telemetry.js` to Vercel repo |
| CORS error in browser | Usually a 404 in disguise | Check endpoint is deployed (curl test) |
| Card shows "offline" | ESP32 not sending / Redis TTL expired | Check WiFi, check firmware logs via Telnet |
| `Cannot load lavatrice_1.glb` | GLB not in Netlify repo root | Add file to repo and deploy |
| Levers not responding | Jumpers on opto board still installed | Remove all 4 red jumpers from PC817 board |
| OTA port not visible in Arduino IDE | ESP32 not on same WiFi subnet | Verify `ping lavatrice-01.local` works |

---

## Security Notes

- `MACHINE_SECRET` is the only authentication for the POST endpoint — keep it private.
- OTA password prevents unauthorized firmware uploads over WiFi — use a strong password.
- The GET `/api/machine-state` endpoint is public (read-only). Add auth if needed.
- The ESP32 disables TLS certificate verification (`setInsecure()`) for simplicity on a factory LAN. For stricter environments, add the Vercel root CA certificate.

---

## Sample Tracker (existing system — unchanged)

The original tracker functionality (Pending / In Progress / Completed / Blocked) continues to work exactly as before. The Laundry machine monitor is a parallel system that does not touch Apps Script, Google Sheets, or any existing tracker logic.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS PWA, Three.js (3D), Service Worker |
| Backend | Vercel Serverless Functions (Node.js ES modules) |
| Database | Upstash Redis (machine state TTL) + Google Sheets (samples) |
| Push notifications | Web Push API + VAPID |
| Hosting | Netlify (frontend), Vercel (API) |
| Microcontroller | ESP32 (Arduino framework), Modbus RTU |
| 3D | Three.js r160, GLTFLoader, GLSL water shader |

