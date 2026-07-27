# Fake SMS fixtures (bank / UPI)

Generate realistic Indian bank / UPI SMS, verify the parser offline, and inject them into an Android emulator inbox so Spentd’s **Import from SMS** flow can be tested end-to-end.

## Quick start

```bash
# from repo root
npm run sms:generate          # write scripts/sms-fixtures/sms-3months.json (90d)
npm run sms:verify            # run shared parser offline (needs shared build)
npm run sms:inject            # inject into running emulator
```

**5 months ≈ 300 messages:**

```bash
node scripts/sms-fixtures/generate-sms-fixture.mjs --days 150 --target 300 --out scripts/sms-fixtures/sms-5months.json
node scripts/sms-fixtures/verify-sms-parse.mjs --fixture scripts/sms-fixtures/sms-5months.json
node scripts/sms-fixtures/inject-sms-emulator.mjs --fixture scripts/sms-fixtures/sms-5months.json
```

Or all offline (default 90d fixture):

```bash
npm run sms:fixture
```

## What you get

| Kind | Examples |
|------|----------|
| Bank debits | HDFC, SBI, ICICI, Axis (UPI + Avl Bal) |
| UPI apps | PhonePe, Google Pay |
| Credits | Peer UPI credits, salary NEFT |
| Edge cases | ATM withdraw, failed UPI |
| Noise | OTPs, promos, personal chats (should be filtered out) |

Templates mirror real Indian DLT headers (`VM-HDFCBK`, `VK-SBIINB`, `VK-PhonePe`, …) with UPI refs, VPA, and available-balance footers.

Default generate: **90 days**, seed `42`. Use `--days 150 --target 300` for ~5 months.

## Inject into emulator Messages

1. Start an AVD (`adb devices` shows `device`).
2. Run:

```bash
npm run sms:inject
# or 5-month file:
node scripts/sms-fixtures/inject-sms-emulator.mjs --fixture scripts/sms-fixtures/sms-5months.json
# smoke test first 30:
node scripts/sms-fixtures/inject-sms-emulator.mjs --limit 30
```

3. Open the system **Messages** app — bank/UPI threads should appear.
4. Open **Spentd** (native build with `READ_SMS`, not Expo Go) → Import SMS → grant permission.

### How inject works

| Emulator type | Method |
|---------------|--------|
| **AOSP / userdebug** (adb root works) | Writes `mmssms.db` with true historical `date` columns |
| **Play Store / user** (no root) | `adb emu sms send` — inbox timestamps are “now”; Spentd still uses **dates inside SMS bodies** for `paidAt` |

Spentd default inbox lookback is **150 days** (~5 months).

## Offline verify only

```bash
npm run build -w @paymenttracker/shared
npm run sms:verify
# detailed merchant misses:
node scripts/sms-fixtures/verify-sms-parse.mjs --verbose
```

## Options

```bash
# regenerate with different window / seed
node scripts/sms-fixtures/generate-sms-fixture.mjs --days 90 --seed 7

# inject to a specific device
node scripts/sms-fixtures/inject-sms-emulator.mjs --serial emulator-5554 --clear
```

## App caps to know

- Default inbox scan: **last 90 days**, max **500** rows (up to 2000).
- Import UI returns at most **120** newest parsed expenses for review.
- After inject, use Spentd’s SMS import / auto-import to exercise the real path.
