# Ledger — Paymenttracker

Premium Android expense tracker that imports **PhonePe** and **GPay** screenshots, with **username + passcode** auth and **cloud sync**.

- **Username** is remembered on device  
- **Passcode** is never stored on device (only Argon2id hash on server) — enter it every login  
- Screenshots stay on-device; only structured expense fields sync  

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo (React Native), Expo Router |
| API | Hono + Drizzle + Postgres |
| Shared | Zod schemas + UPI OCR parsers |
| Auth | Username + 6-digit passcode → JWT (in-memory only on client) |

## Quick start

### 1. Database

```bash
docker compose up -d
cp .env.example apps/api/.env   # if needed
npm install
npm run build -w @paymenttracker/shared
npm run db:migrate
npm run db:seed
```

### 2. API

```bash
npm run api
# → http://localhost:3001/health
```

### 3. Mobile (Android)

```bash
npm run mobile
# then press `a` for Android emulator, or scan the QR with Expo Go
```

**API URL** (`apps/mobile/.env`)

| Environment | `EXPO_PUBLIC_API_URL` |
|-------------|----------------------|
| Web browser | `http://localhost:3001` |
| Android emulator | `http://10.0.2.2:3001` |
| Physical phone | `http://<your-pc-lan-ip>:3001` |

After changing `.env`, restart Expo with cache clear:  
`cd apps/mobile && npx expo start -c`

---

## Test on a real Android phone (easiest)

You need: phone + PC on the **same Wi‑Fi**, API running on the PC.

### 1. Find your PC’s LAN IP

```bash
hostname -I | awk '{print $1}'
# example: 192.168.1.42
```

### 2. Point the app at that IP

Edit `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
```

(use your real IP)

### 3. Start backend + Expo

```bash
# terminal 1 — from repo root
docker compose up -d
npm run db:migrate   # first time only
npm run api

# terminal 2
cd apps/mobile
npx expo start -c
```

### 4. Install Expo Go on the phone

- Play Store → **Expo Go**
- Open the camera / Expo Go and scan the QR code from the terminal  
  (same Wi‑Fi; use **tunnel** mode if LAN fails: `npx expo start -c --tunnel`)

### 5. Create account in the app

1. Open **Create account**
2. Username (3+ chars) + 6-digit passcode twice  
3. Footer should show `API · http://YOUR_IP:3001`  
4. If login fails, open `http://YOUR_IP:3001/health` in the **phone’s browser** — it must return `{"ok":true,...}`

**Firewall:** allow inbound TCP **3001** on the PC if the phone can’t open that URL.

---

## Test on Android emulator

1. Install [Android Studio](https://developer.android.com/studio) → SDK + one virtual device (AVD).
2. Set env for emulator:

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
```

3. Start AVD, then:

```bash
npm run api
cd apps/mobile && npx expo start -c
# press `a` to open on the emulator
```

`10.0.2.2` is the emulator’s alias for your PC’s `localhost`.

---

## Build a real APK / installable app

Expo Go is fine for UI + paste-import. A **standalone APK** is better for production-like testing.

### Option A — local debug build (needs Android SDK)

```bash
cd apps/mobile
# set EXPO_PUBLIC_API_URL first (LAN IP or production API)
npx expo prebuild --platform android
npx expo run:android
```

This compiles a native app, installs it on the connected device/emulator, and runs it.

### Option B — EAS cloud build (no local Android Studio)

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas build:configure
eas build -p android --profile preview   # APK you can sideload
```

Download the APK from the EAS link and install on the phone  
(Settings → allow install from unknown sources if prompted).

> Image OCR (ML Kit) only works in a **dev/production build**, not Expo Go.  
> Paste-text import works in Expo Go.

### OCR (PhonePe / GPay)

1. **Gallery upload (default)** — app sends the screenshot to `POST /ocr`  
   (Tesseract on the API). Works in Expo Go + Android emulator. Image is not stored.
2. **Paste text** — fallback on the Import screen.
3. Parsers in `packages/shared/src/ocr` extract amount, merchant, date, UPI ref.

First OCR request may take longer while Tesseract language data downloads.

## Auth rules

1. Register with username + 6-digit passcode  
2. Server stores **Argon2id hash only**  
3. Client stores **username** in SecureStore  
4. JWT lives **in memory only** — process death or 5 min background → lock screen  

There is **no passcode recovery** in v1.

## API surface

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/register` | — |
| POST | `/auth/login` | — |
| GET | `/auth/me` | JWT |
| GET/POST | `/expenses` | JWT |
| GET/PATCH/DELETE | `/expenses/:id` | JWT |
| GET | `/expenses/summary/month` | JWT |
| GET | `/categories` | JWT |

## Project layout

```
apps/api          Hono API
apps/mobile       Expo Android app
packages/shared   Schemas + OCR parsers
docker-compose.yml
```

## Scripts

```bash
npm run api           # API dev server
npm run mobile        # Expo
npm run db:up         # Postgres
npm run db:migrate
npm run db:seed
npm test              # shared OCR + API tests
```

## Design

Dark private-banking UI: ink background, warm gold accent, DM Sans + IBM Plex Mono for amounts. No generic purple “AI slop” chrome.
