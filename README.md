# Spentd (Paymenttracker)

[![CI](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml/badge.svg)](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Expo](https://img.shields.io/badge/Expo-57-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Premium Android expense tracker** that imports **PhonePe** and **GPay** screenshots + bank SMS, with **username + passcode** auth and optional **cloud sync**.

<p align="center">
  <a href="https://github.com/srineshr1/Paymenttracker/releases/latest"><img src="https://img.shields.io/github/v/release/srineshr1/Paymenttracker?label=Download%20APK&color=C4A574" alt="Download APK" /></a>
</p>

---

## Features

- **Screenshot OCR** — import PhonePe / GPay payment screenshots on-device
- **SMS import** — scan bank/UPI SMS (native Android build)
- **Privacy-first auth** — username remembered; 6-digit passcode never stored on device (Argon2id on server)
- **Cloud sync** — structured expense fields only; screenshots stay local
- **Budgets & cash** — track spending limits and cash wallets
- **Dark banking UI** — ink background, warm gold accent, mono amounts

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo 57 (React Native), Expo Router |
| API | Hono + Drizzle + Postgres |
| Shared | Zod schemas + UPI OCR / SMS parsers |
| Auth | Username + passcode → JWT (in-memory on client) |
| CI/CD | GitHub Actions + EAS Build |

## Download

| Channel | Link |
|---------|------|
| Latest APK | [GitHub Releases](https://github.com/srineshr1/Paymenttracker/releases/latest) |
| Build yourself | [EAS / local](#build-a-real-apk) |

> APKs are published automatically when a version tag is pushed (`v1.0.0`) or via **Actions → Build APK**.

## Quick start

### Prerequisites

- Node.js 20+
- Docker (for Postgres)
- Android device/emulator (for the app)

### 1. Database

```bash
git clone https://github.com/srineshr1/Paymenttracker.git
cd Paymenttracker
cp .env.example apps/api/.env
docker compose up -d
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
# press `a` for Android emulator, or scan the QR with Expo Go
```

**API URL** (`apps/mobile/.env`)

| Environment | `EXPO_PUBLIC_API_URL` |
|-------------|----------------------|
| Web browser | `http://localhost:3001` |
| Android emulator | `http://10.0.2.2:3001` |
| Physical phone | `http://<your-pc-lan-ip>:3001` |

After changing `.env`, restart Expo with cache clear:

```bash
cd apps/mobile && npx expo start -c
```

---

## Test on a real Android phone

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

### 3. Start backend + Expo

```bash
# terminal 1
docker compose up -d
npm run db:migrate   # first time only
npm run api

# terminal 2
cd apps/mobile
npx expo start -c
```

### 4. Install Expo Go

- Play Store → **Expo Go**
- Scan the QR from the terminal (use tunnel if LAN fails: `npx expo start -c --tunnel`)

### 5. Create account

1. Open **Create account**
2. Username (3+ chars) + 6-digit passcode twice
3. Footer should show `API · http://YOUR_IP:3001`
4. If login fails, open `http://YOUR_IP:3001/health` in the phone’s browser

**Firewall:** allow inbound TCP **3001** on the PC if needed.

---

## Test on Android emulator

1. Install [Android Studio](https://developer.android.com/studio) → SDK + AVD
2. Set `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
```

3. Start AVD, then:

```bash
npm run api
cd apps/mobile && npx expo start -c
# press `a`
```

`10.0.2.2` is the emulator’s alias for your PC’s `localhost`.

---

## Build a real APK

**SMS import and ML Kit OCR require a native Spentd build.** Expo Go cannot read the SMS inbox.

### Option A — GitHub Actions (recommended)

1. (Optional but recommended) Add release-signing secrets so Play Protect is less aggressive:
   - `SPENTD_UPLOAD_KEYSTORE_BASE64` — `base64 -w0 spentd-upload.keystore`
   - `SPENTD_UPLOAD_STORE_PASSWORD`
   - `SPENTD_UPLOAD_KEY_ALIAS`
   - `SPENTD_UPLOAD_KEY_PASSWORD`
2. **Actions → Build APK → Run workflow**, or:

```bash
git tag v1.0.1
git push origin v1.0.1
```

APK appears under [Releases](https://github.com/srineshr1/Paymenttracker/releases).

### Option B — local native build

```bash
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android
# or release APK:
cd android && ./gradlew assembleRelease
```

### Option C — EAS CLI

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas build -p android --profile preview
```

### Release signing (local)

Debug-signed release APKs are often **hard-blocked by Google Play Protect** when the app requests SMS. Use a private keystore:

```bash
cd apps/mobile/android
keytool -genkeypair -v -storetype PKCS12 \
  -keystore spentd-upload.keystore -alias spentd \
  -keyalg RSA -keysize 2048 -validity 10000

cp keystore.properties.example keystore.properties
# edit passwords in keystore.properties
./gradlew assembleRelease
```

Never commit `spentd-upload.keystore` or `keystore.properties`.

### Install on a phone (sideload)

1. Enable **Install unknown apps** for your browser/Files app.
2. Open the APK (from Releases or `app/build/outputs/apk/release/`).
3. If **Google Play Protect** blocks Spentd (common for SMS apps outside Play Store):
   - Prefer **More details → Install anyway** when shown.
   - Or: **Settings → Google → Play Protect → Settings (gear)** → temporarily turn off **Scan apps with Play Protect** → install → turn scanning back on.
   - Or USB: `adb install -r path/to/spentd.apk`
4. Open **Spentd** (not Expo Go) → grant **SMS** when prompted → Agree on the consent screen or use **Import → SMS**.

> Image OCR (ML Kit) and SMS need a **dev/production build**, not Expo Go.  
> Paste-text import works in Expo Go.

### Import payments (on-device)

1. **SMS inbox** — bank/UPI SMS parse (native build, `READ_SMS`)
2. **Screenshot OCR** — PhonePe / GPay via ML Kit or Tesseract
3. **Paste text** — fallback on Import screen

Parsers live in `packages/shared/src/ocr`.

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
apps/mobile       Expo Android app (Spentd)
packages/shared   Schemas + OCR / SMS parsers
.github/          CI, issue templates, PR template
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
npm run typecheck
npm run lint          # Biome
npm run lint:fix
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Design

Dark private-banking UI: ink background, warm gold accent, DM Sans + IBM Plex Mono for amounts.

## License

[MIT](LICENSE) © 2026 Srinesh R
