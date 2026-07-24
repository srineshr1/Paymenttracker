# Spentd

[![CI](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml/badge.svg)](https://github.com/srineshr1/Paymenttracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Privacy-first Android expense tracker.** Import PhonePe / GPay / bank payment screenshots and bank SMS. Your data stays **on your phone** — no cloud account, no server required.

<p align="center">
  <a href="https://github.com/srineshr1/Paymenttracker/releases/latest"><img src="https://img.shields.io/github/v/release/srineshr1/Paymenttracker?label=Download%20APK&color=C4A574" alt="Download APK" /></a>
</p>

---

## Get the app

1. Download the latest APK from **[Releases](https://github.com/srineshr1/Paymenttracker/releases/latest)**.
2. On your phone, open the file and allow **Install unknown apps** if Android asks.
3. Open **Spentd** → create a username and 6-digit passcode.

### If Play Protect blocks the install

Spentd requests SMS permission so it can read payment alerts. Apps outside the Play Store often trigger a warning:

- Choose **More details → Install anyway** when offered, or  
- Temporarily turn off **Scan apps with Play Protect**, install, then turn it back on.

### First-time setup

| Goal | What to do |
|------|------------|
| Unlock later | Enter your 6-digit passcode (username is remembered) |
| Import bank SMS | Grant **SMS** when asked, or turn on **SMS auto-import** in Settings |
| Import a screenshot | **Import** → pick a payment screenshot |
| Forgot passcode | On the lock screen → recovery → unlock with **phone lock / biometrics** → set a new PIN or wipe data |

---

## Features

- **On-device only** — expenses live in an encrypted vault on your phone; works offline
- **Screenshot import** — OCR for UPI / bank payment screenshots
- **SMS import** — parse bank and UPI alerts (with review before saving)
- **Budgets & cash** — monthly limits and cash / account balances
- **Export** — share history as CSV or JSON
- **Themes** — system, light, or dark

### Privacy in short

- Passcode unlocks a local vault; the PIN is not stored in plain text  
- No cloud login — there is nothing to “reset password” for remotely  
- Screenshots and SMS stay on the device  
- Leaving the app locks it again (so others can’t open your ledger)

---

## Run from source

For people who want to try the code or contribute.

**Need:** Node.js 20+, and an Android phone or emulator.

```bash
git clone https://github.com/srineshr1/Paymenttracker.git
cd Paymenttracker
npm install
npm run build -w @paymenttracker/shared
npm run mobile
```

Then press `a` for an emulator, or scan the QR with **Expo Go**.

> **Expo Go limits:** no SMS inbox, slower screenshot OCR. Full SMS + fast OCR need a **native build** (below).

### Full features (native Android build)

```bash
npm run mobile:android
# or:
cd apps/mobile && npx expo run:android
```

This builds Spentd as a real app on the device/emulator (SMS + ML Kit work).

### Project layout

```
apps/mobile       Spentd (Expo / React Native) — local-first
apps/api          Optional backend (not used by the app today)
packages/shared   Shared types + payment/SMS parsers
```

More detail for contributors: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## FAQ

**Does this send my expenses to a server?**  
No. The shipped app stores everything on the device.

**Why does it need SMS permission?**  
Only to read payment-related messages you choose to import. You can use screenshots or manual entry without SMS.

**Can I use it without installing the APK?**  
You can run the JS app in Expo Go for a limited demo, but SMS import will not work. Prefer the [release APK](https://github.com/srineshr1/Paymenttracker/releases/latest).

**I want to contribute**  
See [CONTRIBUTING.md](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [Security](SECURITY.md). Changelog: [CHANGELOG.md](CHANGELOG.md).

---

## License

[MIT](LICENSE) © 2026 Srinesh R
