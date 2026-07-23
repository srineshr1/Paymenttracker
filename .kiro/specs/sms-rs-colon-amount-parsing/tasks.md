# Implementation Plan

All work is in `packages/shared/src/ocr/`. Test runner: `npm test` from `packages/shared` (`node --import tsx --test src/**/*.test.ts`); type check: `npm run typecheck`. No property-testing library is installed, so the "property" test is a dependency-free generative loop over input combinations.

- [x] 1. Write the bug-condition exploration test (expected to FAIL on current code)
  - In `packages/shared/src/ocr/sms.test.ts`, add constants `UNION1` and `UNION2` holding the two reported messages verbatim.
  - Add a generative check that loops over currency tokens `["₹","Rs","Rs.","INR"]` × separators `["", " ", ":", ": "]` × amounts `["25.00","2.00","1,250.50"]` (skip empty separator for non-`₹` tokens) and asserts `isPaymentSms(\`ICICI A/c XX debited ${cur}${sep}${amt} ref 417600011122\`)` is `true` and `parseSmsMessage(...).amount` equals the amount normalized to 2dp.
  - Add concrete assertions: `isPaymentSms(UNION1)` / `isPaymentSms(UNION2)` are `true`; `parseSmsMessage(UNION1)` → amount `"25.00"`, direction `"debit"`, availableBalance `"999.00"`, upiRef `"289917195718"`, `paidAt` starts with `"2026-07-20"`; `parseSmsMessage(UNION2)` → amount `"2.00"`, availableBalance `"712.00"`, upiRef `"620230268587"`.
  - Add `parseSmsMessages([UNION1, UNION2])` returns length `2`.
  - Run `npm test` and CONFIRM the new colon-separator cases FAIL on the current (unfixed) code — this reproduces and proves the bug. Do NOT modify any source file in this task.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.4, 3.1, 3.2, 4.1, 4.2_

- [x] 2. Widen the payment-detection gate to accept colon-separated amounts
  - In `sms.ts`, replace `AMOUNT_TOKEN_RE` with a form where the currency token may be followed by an optional colon and/or whitespace before the number (prefix `(?:₹|rs\.?|inr)\s*:?\s*`), per design §1. Consider extracting the shared prefix into a named constant.
  - Confirm `isPaymentSms(UNION1)` / `isPaymentSms(UNION2)` now return `true` and all existing `isPaymentSms` tests still pass.
  - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2_

- [x] 3. Attribute currency across the colon in amount scanning
  - In `interpret.ts`, insert `:?` between the currency capture group and the number in `AMOUNT_SCAN_RE` (`(₹|rs\.?|inr|%|¥|₽)?\s*:?\s*(number)`), per design §2.
  - In `interpret.test.ts`, assert `extractBestAmount` on a body containing both a `Rs:25.00` transaction and an `Avl Bal Rs:999.00` footer returns `"25.00"` (transaction beats balance).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2_

- [x] 4. Extract available balance from colon format
  - In `interpret.ts`, add `:?` after the optional currency group in both `extractAvailableBalance` patterns (design §3).
  - In `interpret.test.ts`, assert `extractAvailableBalance("SB A/c debited. Avl Bal Rs:999.00")` === `"999.00"`.
  - _Requirements: 3.1, 3.2_

- [x] 5. Capture the Fvg/Favouring beneficiary as merchant (Requirement 6)
  - In `interpret.ts`, add a `Fvg:`/"Favouring" entry to `MERCHANT_PATTERNS` that captures the beneficiary and terminates at the balance/footer (`avl|avail|bal`, `ref`, punctuation, currency, newline, or end), per design §4.
  - Apply a conservative trailing account-type trim (`/\s+(SA|CA|CC|OD|SB)$/`) to the captured name before it is scored, so `MS K  SA` → `MS K`.
  - Extend `sms.test.ts`: `parseSmsMessage(UNION1).merchant` matches `/MS K/` and `parseSmsMessage(UNION2).merchant` matches `/AWS Indi/`.
  - Confirm existing merchant tests (e.g. HDFC → swiggy, GPay → Ravi) are unchanged.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 6. Confirm the bug-condition test passes and add import-eligibility assertions
  - Re-run `npm test`; confirm the Task 1 colon-format cases now PASS.
  - In `sms.test.ts`, add assertions that `parseSmsMessage(UNION1).confidence >= 0.55` and `parseSmsMessage(UNION2).confidence >= 0.55`, and that `isJunkForAutoImport(parseSmsMessage(UNION1))` and `isJunkForAutoImport(parseSmsMessage(UNION2))` are both `false` (import `isJunkForAutoImport` from `./quality`).
  - _Requirements: 1.1, 1.2, 1.3, 2.4, 3.2, 4.3, 6.2_

- [x] 7. Regression and type check across the shared package
  - Run `npm test` in `packages/shared` and confirm the entire suite is green, including the pre-existing HDFC / SBI / ICICI / PhonePe / GPay / credit / card-spend / ATM / autopay cases (no regressions in amount, balance, or confidence).
  - Run `npm run typecheck` and confirm it passes.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
