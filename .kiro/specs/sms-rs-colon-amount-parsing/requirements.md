# Requirements Document

## Introduction

The on-device SMS import feature scans the Android inbox and parses bank/UPI messages into expenses (`packages/shared/src/ocr/`, consumed by `apps/mobile/src/features/sms/`). It currently fails to recognize messages that write monetary amounts in the compact `Rs:<amount>` form — the currency token `Rs` immediately followed by a colon and the number, with no space (e.g. `Rs:25.00`, `Avl Bal Rs:999.00`). Union Bank of India uses this format.

Root cause: the payment-detection gate `isPaymentSms()` requires a currency-marked amount, and its `AMOUNT_TOKEN_RE` only allows an optional period and/or whitespace between the currency token and the digits — never a colon. So `Rs:25.00` does not match, `hasAmount` is `false`, and the message is classified as a non-payment and skipped before it is ever interpreted. The same colon gap also breaks available-balance extraction (`extractAvailableBalance`) and detaches the currency marker in amount scoring (`extractBestAmount`), weakening confidence.

This spec covers teaching the shared transaction interpreter to accept an optional colon (and general separator) between a currency token and its amount, so these messages import correctly — amount, direction, date, reference, and available balance — without regressing existing formats. All parsing stays on-device.

### Reported examples (must import correctly)

```
Union Bank of India A/c *0008 Debited Rs:25.00 on 20-07-2026 15:46:17 by Mob Bk ref no 289917195718, Fvg: MS K  SA Avl Bal Rs:999.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472

Union Bank of India A/c *0008 Debited Rs:2.00 on 21-07-2026 21:42:34 by Mob Bk ref no 620230268587, Fvg: AWS Indi Avl Bal Rs:712.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472
```

## Requirements

### Requirement 1 — Recognize colon-separated currency amounts as payments

**User Story:** As someone who receives bank debit/credit SMS, I want messages that write the amount as `Rs:25.00` (currency token, colon, no space) to be recognized as payment messages, so that they are not silently skipped by the importer.

#### Acceptance Criteria

1. WHEN an SMS body contains a currency-marked amount in the form `<currency>:<number>` (e.g. `Rs:25.00`, `INR:2.00`, `₹:100`), THEN the payment-detection gate SHALL treat the body as containing an amount.
2. WHEN a bank SMS uses the `Rs:` colon amount format and also contains a payment verb (e.g. "Debited"), THEN `isPaymentSms` SHALL return `true`.
3. WHEN either reported Union Bank of India message is scanned, THEN it SHALL pass the payment-detection gate and NOT be filtered out as non-payment.

### Requirement 2 — Extract the correct transaction amount from colon format

**User Story:** As a user, I want the debited amount parsed correctly from `Rs:25.00`, so my imported expense shows the right value.

#### Acceptance Criteria

1. WHEN a payment SMS contains a transaction amount in `Rs:<number>` form, THEN the interpreter SHALL extract the numeric value (e.g. `Rs:25.00` → `25.00`, `Rs:2.00` → `2.00`).
2. WHEN both a transaction amount (`Rs:25.00`) and an available balance (`Avl Bal Rs:999.00`) are present in colon format, THEN the interpreter SHALL select the transaction amount and NOT the balance as the expense amount.
3. WHEN a colon-format amount is extracted, THEN it SHALL be treated as currency-marked for confidence scoring (not penalized as a bare number).
4. WHEN the reported messages are interpreted, THEN the resulting `ParsedExpense.amount` SHALL be `25.00` and `2.00` respectively, each with `direction` = `debit`.

### Requirement 3 — Extract available balance from colon format

**User Story:** As a user, I want my running account balance to sync from bank SMS even when the balance is written `Avl Bal Rs:999.00`, so my balance stays accurate.

#### Acceptance Criteria

1. WHEN a bank SMS footer contains an available balance in `Avl Bal Rs:<number>` (colon) form, THEN `extractAvailableBalance` SHALL return the balance value.
2. WHEN the reported messages are interpreted, THEN `ParsedExpense.availableBalance` SHALL be `999.00` and `712.00` respectively.

### Requirement 4 — Parse remaining fields for the reported messages

**User Story:** As a user, I want the date and reference number captured for these messages, so the imported expense is complete and de-duplicable.

#### Acceptance Criteria

1. WHEN the reported messages are interpreted, THEN `paidAt` SHALL reflect the in-body timestamps (2026-07-20 15:46:17 and 2026-07-21 21:42:34, device-local).
2. WHEN the reported messages are interpreted, THEN `upiRef` SHALL be `289917195718` and `620230268587` respectively.
3. WHEN a colon-format payment SMS is parsed end-to-end, THEN its `confidence` SHALL be at or above the minimum import threshold (0.35) so it is retained by `parseSmsMessages`.

### Requirement 5 — Generalize separator handling without regressions

**User Story:** As a maintainer, I want colon handling applied consistently across currency tokens while existing formats keep working, so we fix the whole class of bug without introducing regressions.

#### Acceptance Criteria

1. WHERE a currency token (`₹`, `Rs`, `Rs.`, `INR`) precedes an amount, the parser SHALL accept an optional colon and/or whitespace between the token and the number (`Rs 25`, `Rs.25`, `Rs:25`, `₹25`, `INR: 25` all detected).
2. WHEN existing supported formats without a colon are parsed, THEN their results SHALL be unchanged (no regression in amount, balance, or confidence).
3. WHEN the shared parser test suite runs, THEN all existing tests SHALL continue to pass.
4. WHEN new tests using the two reported messages run, THEN they SHALL assert successful import (amount, direction, date, ref, available balance) and pass.

### Requirement 6 (optional) — Capture the beneficiary from "Fvg:" as the merchant

**User Story:** As a user, I want the payee shown for these messages (e.g. "MS K", "AWS Indi") instead of a generic label, so the imported expense is meaningful.

#### Acceptance Criteria

1. WHEN a bank SMS contains a beneficiary marker `Fvg:` / `Favouring` followed by a name, THEN the interpreter SHALL consider that name as a merchant candidate.
2. WHEN the reported messages are interpreted, THEN the merchant SHOULD resolve to the beneficiary name (e.g. "MS K", "AWS Indi") rather than the bank name or a generic default.
3. IF this requirement is descoped, THEN the messages SHALL still import per Requirements 1–5 (merchant may fall back to the existing default). Note: the field terminator is ambiguous (e.g. `Fvg: MS K  SA Avl Bal...`), so the exact captured name may need refinement in design.

## Constraints and Non-Functional Requirements

1. All SMS parsing SHALL remain on-device; message content SHALL NOT leave the phone (preserve the existing privacy guarantee).
2. Code changes SHALL be confined to `packages/shared/src/ocr/` (the shared parser) and its test files; no changes to native modules or app data layers are required for this fix.
3. The fix SHALL be deterministic (no network, no model download), consistent with the existing interpreter design.