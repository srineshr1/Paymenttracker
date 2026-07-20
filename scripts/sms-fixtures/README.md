# Fake SMS fixtures (3 months)

Generate realistic Indian bank / UPI SMS, verify the parser offline, and inject them into an Android emulator inbox so Spentd’s **Import from SMS** flow can be tested end-to-end.

## Quick start

```bash
# from repo root
npm run sms:generate          # write scripts/sms-fixtures/sms-3months.json
npm run sms:verify            # run shared parser offline (needs shared build)
npm run sms:inject:clear      # wipe emulator SMS + inject full fixture
```

Or all offline in one go:

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

Default: **90 days**, deterministic seed `42`, ~hundreds of messages spanning ~3 months.

## Inject into emulator Messages

1. Start an AVD (`adb devices` shows `device`).
2. Run:

```bash
npm run sms:inject:clear
# or without wipe:
npm run sms:inject
# smoke test first 30:
node scripts/sms-fixtures/inject-sms-emulator.mjs --limit 30 --clear
```

3. Open the system **Messages** app — bank/UPI threads should appear.
4. Open **Spentd** (native build with `READ_SMS`, not Expo Go alone for inbox scan) → Import SMS → grant permission.

Injection writes the emulator telephony DB (`mmssms.db`) with historical `date` + `sub_id=1` (active SIM), then **clears Google Messages’ cache** so the UI re-indexes. Spentd reads the same Telephony inbox (`READ_SMS`, 90-day lookback in `readInbox.ts`).

If Messages still looks empty after inject: force-stop Messages and reopen, or run `npm run sms:inject:clear` again.

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
