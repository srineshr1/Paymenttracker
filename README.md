# Spentd (Paymenttracker)

[![CI](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml/badge.svg)](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Expo](https://img.shields.io/badge/Expo-57-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Privacy-first Android expense tracker** — import payment screenshots (PhonePe, GPay, bank apps…) and bank/UPI SMS. Everything stays **on your phone**: encrypted local vault, SQLite, no account server required.

<p align="center">
  <a href="https://github.com/srineshr1/Paymenttracker/releases/latest"><img src="https://img.shields.io/github/v/release/srineshr1/Paymenttracker?label=Download%20APK&color=C4A574" alt="Download APK" /></a>
</p>

---

## Features

- **Local-first** — expenses, categories, and prefs live on-device (SQLite + SecureStore). Works fully offline.
- **Encrypted vault** — 6-digit passcode derives a key; data encryption key stays in memory only while unlocked
- **Screenshot OCR** — payment screenshots from any app (ML Kit in native builds; Tesseract fallback / Expo Go)
- **SMS import** — bank/UPI SMS, auto-import, review screen with skip reasons (native Android build + `READ_SMS`)
- **Passcode recovery** — forgot your app PIN? Use phone lock / biometrics to reset it (or wipe data)
- **Budgets & cash** — monthly limits and cash / account wallets (balance can update from SMS)
- **Export** — share expenses as CSV or JSON
- **Themes** — system, light (warm paper), or dark (ink & gold)

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo 57 (React Native), Expo Router, SQLite |
| Data | Local-first repository; encrypted vault (AES + passcode KDF) |
| Shared | Zod schemas + UPI OCR / SMS parsers |
| Auth | Username + 6-digit passcode → unlock vault (single account per device) |
| Optional API | Hono + Drizzle + Postgres (in-repo for future cloud sync; **not used by the app today**) |
| CI/CD | GitHub Actions + EAS Build |

## Download

| Channel | Link |
|---------|------|
| Latest APK | [GitHub Releases](https://github.com/srineshr1/Paymenttracker/releases/latest) |
| Build yourself | [EAS / local](#build-a-real-apk) |

> APKs are published when a version tag is pushed (`v1.2.0`) or via **Actions → Build APK**.

## Quick start (app)

### Prerequisites

- Node.js 20+
- Android device or emulator

```bash
git clone https://github.com/srineshr1/Paymenttracker.git
cd Paymenttracker
npm install
npm run build -w @paymenttracker/shared
npm run mobile
# press `a` for Android emulator, or scan the QR with Expo Go
```

Create a username + 6-digit passcode in the app. No backend or Docker is required for normal use.

> **SMS inbox** and **ML Kit OCR** need a **native Spentd build** (dev client or release APK). Expo Go supports paste-text import and Tesseract screenshot OCR.

### Native dev build (recommended for SMS)

```bash
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android
# or from repo root:
npm run mobile:android
```

---

## Test on a real Android phone

1. Install the [latest APK](https://github.com/srineshr1/Paymenttracker/releases/latest), or run a dev client over USB (`npx expo run:android` with the device connected).
2. Open **Spentd** → create account (username + passcode).
3. For SMS: grant **SMS** when prompted, or enable **SMS auto-import** in Settings after the consent screen.
4. For screenshots: use **Import** → pick a payment screenshot.

**Expo Go (limited):** same Wi‑Fi as your PC, `npm run mobile`, scan the QR. No SMS inbox; OCR uses the Tesseract WebView path.

---

## Test on Android emulator

1. Install [Android Studio](https://developer.android.com/studio) → SDK + AVD
2. Start the AVD, then:

```bash
npm run mobile
# press `a`
```

For SMS end-to-end tests, inject fixtures:

```bash
npm run sms:fixture          # generate + verify offline
npm run sms:inject:clear     # wipe emulator inbox + inject (needs adb + running AVD)
```

See [scripts/sms-fixtures/README.md](scripts/sms-fixtures/README.md).

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
git tag v1.2.1
git push origin v1.2.1
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

Debug-signed release APKs are often **hard-blocked by Google Play Protect** when the app requests SMS. Use a private keystore under `apps/mobile/credentials/` (survives `expo prebuild`):

```bash
cd apps/mobile/credentials
keytool -genkeypair -v -storetype PKCS12 \
  -keystore spentd-upload.keystore -alias spentd \
  -keyalg RSA -keysize 2048 -validity 10000

cp keystore.properties.example keystore.properties
# edit passwords; storeFile should point at ../credentials/spentd-upload.keystore

cp keystore.properties ../android/keystore.properties
cd ../android && ./gradlew assembleRelease
```

Never commit `spentd-upload.keystore` or `keystore.properties`. Details: [apps/mobile/credentials/README.md](apps/mobile/credentials/README.md).

### Install on a phone (sideload)

1. Enable **Install unknown apps** for your browser/Files app.
2. Open the APK (from Releases or `android/app/build/outputs/apk/release/`).
3. If **Google Play Protect** blocks Spentd (common for SMS apps outside Play Store):
   - Prefer **More details → Install anyway** when shown.
   - Or: **Settings → Google → Play Protect → Settings (gear)** → temporarily turn off **Scan apps with Play Protect** → install → turn scanning back on.
   - Or USB: `adb install -r path/to/spentd.apk`
4. Open **Spentd** (not Expo Go) → grant **SMS** when prompted → Agree on the consent screen (or enable **SMS auto-import** later in Settings).

### Import payments (on-device)

1. **SMS (automatic)** — bank/UPI SMS parsed on-device once enabled (consent screen or Settings; native build, `READ_SMS`)
2. **Screenshot OCR** — payment screenshots via ML Kit (native) or Tesseract (fallback)
3. **Paste text** — fallback on the Import screen

Parsers live in `packages/shared/src/ocr`.

## Auth & privacy

1. Register once per device with **username + 6-digit passcode**
2. Passcode unlocks an **on-device vault** (key derivation + AES); the PIN is never stored in plaintext
3. Username is remembered in SecureStore; returning users unlock with **passcode only**
4. Vault DEK lives **in memory only** — leaving the app to the background locks the session (gallery / share / SMS permission dialogs are suppressed so import is not interrupted)
5. **Forgot passcode?** Login screen → recovery: verify with **phone lock / biometrics**, then either set a new PIN (keep history) or erase everything

There is **no remote password reset** — recovery is device-bound by design.

## Optional API (future sync / development)

The monorepo still includes a Hono + Postgres API. The mobile app is **local-first** and does not call it today (`apps/mobile/src/api/client.ts` re-exports the local repository). Keep the API around for tests, shared schemas, or a future sync adapter.

### Run the API

```bash
cp .env.example apps/api/.env
docker compose up -d
npm install
npm run build -w @paymenttracker/shared
npm run db:migrate
npm run db:seed
npm run api
# → http://localhost:3001/health
```

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/register` | — |
| POST | `/auth/login` | — |
| GET | `/auth/me` | JWT |
| POST | `/auth/change-passcode` | JWT |
| PATCH | `/auth/username` | JWT |
| GET/POST | `/expenses` | JWT |
| GET/PATCH/DELETE | `/expenses/:id` | JWT |
| GET | `/expenses/summary/month` | JWT |
| GET | `/categories` | JWT |
| POST | `/ocr` | JWT |

## Project layout

```
apps/api          Optional Hono API (future sync)
apps/mobile       Expo Android app (Spentd) — local-first
packages/shared   Schemas + OCR / SMS parsers
scripts/          SMS fixtures for emulator testing
.github/          CI, issue templates, PR template
docker-compose.yml
```

## Scripts

```bash
npm run mobile        # Expo
npm run mobile:android
npm run api           # Optional API dev server
npm run db:up         # Postgres (API only)
npm run db:migrate
npm run db:seed
npm test              # shared OCR + API tests
npm run typecheck
npm run lint          # Biome
npm run lint:fix
npm run sms:fixture   # generate + verify SMS fixtures
npm run sms:inject    # inject fixtures into emulator
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 Srinesh R
