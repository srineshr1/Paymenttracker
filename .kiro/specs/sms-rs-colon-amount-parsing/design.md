# Design Document

## Overview

The on-device transaction interpreter (`packages/shared/src/ocr/`) drops bank SMS that write amounts as `Rs:<number>` (currency token, colon, no space) — the format Union Bank of India uses. This design makes the amount-detection regexes accept an optional colon (and whitespace) between a currency token (`₹` / `Rs` / `Rs.` / `INR`) and the number, at every point on the SMS path where an amount or balance is matched. Requirement 6 additionally adds a beneficiary (`Fvg:` / "Favouring") merchant pattern.

The change is deliberately surgical: it only widens the separator that already sat between currency and digits, so strings that match today keep matching identically, and strings that never matched (colon-separated) now do.

### Reference messages

```
M1: Union Bank of India A/c *0008 Debited Rs:25.00 on 20-07-2026 15:46:17 by Mob Bk ref no 289917195718, Fvg: MS K  SA Avl Bal Rs:999.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472
M2: Union Bank of India A/c *0008 Debited Rs:2.00 on 21-07-2026 21:42:34 by Mob Bk ref no 620230268587, Fvg: AWS Indi Avl Bal Rs:712.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472
```

## SMS Import Pipeline (where the failure happens)

```
listInboxSms() ──► parseSmsMessages(messages)
                     │
                     ├─ isPaymentSms(RAW body)          ◄── (1) GATE: AMOUNT_TOKEN_RE fails on "Rs:25.00" → message dropped here
                     │
                     └─ parseSmsMessage() ─► interpretTransactionText()
                            │
                            ├─ normalizeOcrText()         (leaves "Rs:25.00" as-is: colon blocks the Rs→₹ rule)
                            ├─ extractBestAmount()        ◄── (2) AMOUNT_SCAN_RE: colon detaches currency → amount scored as bare
                            ├─ extractAvailableBalance()  ◄── (3) balance regex fails on "Avl Bal Rs:999.00"
                            ├─ extractBestMerchant()      ◄── (4) no "Fvg:" pattern → merchant null (R6)
                            ├─ extractDateSmart / extractRef / extractDirection  (already work)
                            └─ scoreConfidence()
```

Only stage (1) is fatal (the row is filtered before parsing). Stages (2)–(3) degrade quality/balance; (4) is the R6 enhancement.

## Root Cause (exact)

- **`sms.ts` › `AMOUNT_TOKEN_RE`** (runs on the RAW body inside `isPaymentSms`):
  `/(?:₹|rs\.?\s*|inr\s*)\s*[0-9]…/i` — between the currency token and the digits only `\s*` (whitespace) is allowed. `Rs:25.00` has a colon, so there is no match, `hasAmount` is `false`, and `isPaymentSms` returns `false`. `parseSmsMessages` skips the row.
- **`interpret.ts` › `AMOUNT_SCAN_RE`**: `(₹|rs\.?|inr|…)?\s*(number)` — the colon prevents the optional currency group from binding to `25.00`, so it is scored as a bare number (loses the `+2.2` currency weight).
- **`interpret.ts` › `extractAvailableBalance`**: `…(?:₹|rs\.?|inr)?\s*${AMT}` — the colon after `Rs` breaks the match, so `availableBalance` is `null`.
- **`interpret.ts` › `MERCHANT_PATTERNS`**: no rule for the `Fvg:` beneficiary field, so merchant is `null` (falls back to "UPI payment" via `resolveMerchant`).

## Design Approach

**Targeted separator widening (chosen).** Insert an optional colon into the four amount/balance detectors on the SMS path. `normalizeOcrText` is intentionally left unchanged — it is a broad OCR-repair function shared with screenshot parsing, and the colon format is cleaner to absorb at the exact points amounts are detected. The edits are additive (`\s*` → `\s*:?\s*`), so the regression surface is limited to strings that contain a colon between currency and number — strings that did not match before.

Rejected alternative: making `normalizeOcrText` rewrite `Rs:` → `₹`. It is fewer edits but changes a normalization step used by every parser (incl. OCR screenshots) and still requires the `AMOUNT_TOKEN_RE` fix (the gate runs pre-normalize). Larger blast radius for no functional gain.

## Components and Changes

All changes are within `packages/shared/src/ocr/`.

### 1. `sms.ts` — accept colon in the payment gate (R1)

Replace `AMOUNT_TOKEN_RE` so the currency token may be followed by an optional colon and/or whitespace.

```ts
// Currency token, then an optional ":" and/or whitespace, then the number.
// Matches "Rs 25", "Rs.25", "Rs:25", "₹25", "INR: 25".
const CURRENCY_AMOUNT_SEP = String.raw`(?:₹|rs\.?|inr)\s*:?\s*`;
const AMOUNT_TOKEN_RE = new RegExp(
  `${CURRENCY_AMOUNT_SEP}[0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?` +
    `|${CURRENCY_AMOUNT_SEP}[0-9]+(?:\\.[0-9]{1,2})?`,
  "i",
);
```

Effect: `isPaymentSms(M1/M2)` → `hasAmount = true`; combined with the `Debited` verb, returns `true`. Rows reach the parser.

### 2. `interpret.ts` — attribute currency across a colon (R2)

Insert `:?` between the currency capture group and the number in `AMOUNT_SCAN_RE`:

```ts
const AMOUNT_SCAN_RE =
  /(₹|rs\.?|inr|%|¥|₽)?\s*:?\s*((?:[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)|(?:[0-9]+(?:\.[0-9]{1,2})?))/gi;
```

Effect: for `Rs:25.00` the currency group binds, so `hasCurrency` is `true` (amount gets the `+2.2` weight and is treated as currency-marked per R2.3). The transaction amount (`25.00`) still outscores the balance (`999.00`) because the balance keeps its `-4.0` "avl bal" penalty. `parseAmountToken` returns `25.00` / `2.00`. For non-currency colons (e.g. `id:123`, `15:46`) the currency group stays empty, `numStart`/`charBefore` are unchanged, and scoring is identical — no behavior change.

### 3. `interpret.ts` — extract colon-format balance (R3)

Add `:?` after the currency group in both `extractAvailableBalance` patterns:

```ts
// pattern 1 (…markers…)\s*[:\-]?\s*(?:is\s*)?(?:₹|rs\.?|inr)?\s*:?\s*${AMT}
// pattern 2 (?:^|[.\s])bal(?:ance)?\s*[:\-]?\s*(?:₹|rs\.?|inr)\s*:?\s*${AMT}\s*$
```

Effect: `Avl Bal Rs:999.00` → `999.00`, `Avl Bal Rs:712.00` → `712.00`. Feeds `applyPaymentToAccount` for balance sync.

### 4. `interpret.ts` — beneficiary as merchant (R6)

Add a `Fvg:` / "Favouring" pattern to `MERCHANT_PATTERNS`, terminating at the balance/footer, and trim a trailing account-type code.

```ts
// Union-style beneficiary: "Fvg: MS K SA Avl Bal ...", "Fvg: AWS Indi Avl Bal ..."
{
  re: /(?:fvg|favou?ring)\s*[:.]?\s*([A-Za-z][A-Za-z0-9 .&'()-]{1,40}?)(?:\s+(?:avl|avail|bal)\b|\s+ref\b|\s*[.;,]|\s+(?:₹|rs\.?|inr)\b|\n|\s*$)/i,
  score: 2.6,
},
```

Because `normalizeOcrText` collapses runs of spaces, `Fvg: MS K  SA` becomes `Fvg: MS K SA`; the capture yields `MS K SA` and `AWS Indi`. A conservative post-capture trim removes a trailing uppercase account-type token so the payee reads naturally:

```ts
// Applied to the Fvg capture before pushMerchant():
name = name.replace(/\s+(SA|CA|CC|OD|SB)$/, "").trim(); // "MS K SA" → "MS K"
```

Effect: merchant resolves to `MS K` and `AWS Indi`. R6 AC2 is a SHOULD; `MS K SA` would also be acceptable, but the trim matches the reported expectation. Existing merchant patterns are unaffected (the new rule is additive and only fires on `Fvg`/`Favouring`).

## Data Models

No schema changes. `ParsedExpense` (`types.ts`) already carries `amount`, `direction`, `merchant`, `paidAt`, `upiRef`, `availableBalance`, `confidence`. This fix only changes how those fields get populated for colon-format messages.

## Expected Parse Results (post-fix)

| Field | M1 | M2 |
| --- | --- | --- |
| `isPaymentSms` | true | true |
| `amount` | `25.00` | `2.00` |
| `direction` | `debit` | `debit` |
| `availableBalance` | `999.00` | `712.00` |
| `upiRef` | `289917195718` | `620230268587` |
| `paidAt` (date part) | `2026-07-20` | `2026-07-21` |
| `merchant` (R6) | `MS K` | `AWS Indi` |
| `source` | `sms` | `sms` |
| `confidence` | ~1.0 (≥0.55) | ~1.0 (≥0.55) |
| `isJunkForAutoImport` | false | false |

Note: even without R6 (merchant `null`), `confidence` ≈ 0.70 and the present `upiRef` keeps `isJunkForAutoImport` `false`, so both messages still import (with the `resolveMerchant` fallback label). R6 improves the displayed payee.

## Error Handling & Edge Cases

- **Balance vs amount collision:** both use `Rs:` now; the `-4.0` balance-marker penalty in `extractBestAmount` keeps the transaction amount ranked above the balance. Covered by a dedicated test.
- **Colon not adjacent to currency** (`15:46:17`, `id:123`): currency group stays empty; no currency attribution, unchanged scoring/selection.
- **Multiple colons / spacing** (`Rs: 25`, `Rs :25`): absorbed by `\s*:?\s*`.
- **Fvg terminator ambiguity:** the account-type trim is limited to a fixed uppercase set (`SA|CA|CC|OD|SB`); it will not alter names like `AWS Indi`. Worst case it leaves a trailing token, which is still a usable merchant.
- **Privacy/determinism:** no network, no new I/O; all changes are pure regex/string logic (honors the constraints).

## Testing Strategy

Framework matches the existing suite: `node:test` + `node:assert/strict`, `describe`/`it`, colocated `*.test.ts`.

### Unit — `sms.test.ts` (extend)
- `isPaymentSms(M1)` and `isPaymentSms(M2)` → `true` (R1).
- `parseSmsMessage(M1)` → `amount "25.00"`, `direction "debit"`, `availableBalance "999.00"`, `upiRef "289917195718"`, `paidAt` starts with `2026-07-20`, `confidence >= 0.55`, `merchant` matches `/MS K/` (R2–R4, R6).
- `parseSmsMessage(M2)` → `amount "2.00"`, `availableBalance "712.00"`, `upiRef "620230268587"`, `merchant` matches `/AWS Indi/`.
- `parseSmsMessages([M1, M2, OTP])` → length `2` (rows retained, OTP filtered).
- `isJunkForAutoImport(parse(M1))` and `(M2)` → `false`.

### Unit — `interpret.test.ts` (extend)
- `extractBestAmount("… Debited Rs:25.00 … Avl Bal Rs:999.00 …")` === `"25.00"` (picks txn over balance).
- `extractAvailableBalance("… Avl Bal Rs:999.00")` === `"999.00"`.

### Regression (must stay green)
- Existing `HDFC`, `SBI`, `ICICI`, `PhonePe`, `GPay`, `CREDIT`, card/ATM/autopay cases unchanged: `Rs 450.00` → `450.00`, `₹99.00` → `99.00`, `INR 2,499.00` accepted, `Avl Bal Rs 10,000.00` → `10000.00`.
- Full `packages/shared` test suite passes.

### Property-based (deterministic parser → good PBT fit)
- Generate amount `A` (1–6 digits, optional 2dp, optional grouping), currency `C ∈ {"₹","Rs","Rs.","INR"}`, separator `S ∈ {"", " ", ":", ": ", " : "}` (with `S` non-empty when `C ∈ {"Rs","INR"}` so tokens stay well-formed). Property: for `body = \`Bank A/c XX debited ${C}${S}${A} ref 417600011122\``, `isPaymentSms(body)` is `true` AND `parseSmsMessage(body).amount === normalize(A)`.
- Invariant: adding/removing the colon separator never changes the extracted amount value.

## Requirements Traceability

| Requirement | Design element |
| --- | --- |
| R1 (gate accepts colon) | `AMOUNT_TOKEN_RE` change §1 |
| R2 (amount extraction + currency scoring) | `AMOUNT_SCAN_RE` change §2 |
| R3 (available balance) | `extractAvailableBalance` change §3 |
| R4 (date/ref/confidence retained) | No change needed; verified by tests (extractRef, extractDateSmart, scoreConfidence already handle these) |
| R5 (generalize, no regressions) | Shared separator form + regression + PBT tests |
| R6 (Fvg → merchant) | New `MERCHANT_PATTERNS` entry + account-type trim §4 |

## Out of Scope

- `shared.ts` › `extractAmount` / `extractAllAmounts` (legacy first-match extractors used by screenshot/history parsing, not on the SMS path) have the same colon limitation but are not touched here to keep the OCR screenshot behavior stable. Can be a follow-up if colon-format screenshots appear.
- No changes to native modules (`modules/sms-inbox`), app data layer, or UI.