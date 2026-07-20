# PhonePe / GPay history OCR dataset

Labeled fixtures used to **train / regress** the history-list parser until
amounts, merchants, and dates match real UPI apps.

## Layout

| File | Purpose |
|------|---------|
| `dataset.json` | Ground-truth labels + OCR text (or `ocrFile` pointers) |
| `phonepe-prathis-real.png` | Your real Transaction History screenshot |
| `phonepe-prathis-real-psm*.txt` | Tesseract dumps of that screenshot |
| `synth-*.png` / `synth-*-psm*.txt` | Synthetic history screens + OCR |
| `history.dataset.test.ts` | Eval harness (`npm test` in `packages/shared`) |

## Expected rows (your screenshot)

| # | Merchant | Amount | Date | Status |
|---|----------|--------|------|--------|
| 1 | prathis | ₹1 | 1 min ago | success |
| 2 | prathis | ₹30,000 | 02 Jul 2020 | **failed — skipped** |
| 3 | prathis | ₹49,999 | 02 Jul 2020 | success |
| 4 | prathis | ₹40,000 | 01 Jul 2020 | success |
| 5 | prathis | ₹100 | 01 Jul 2020 | success |

## Training loop

1. Add a new sample to `dataset.json` with:
   - `ocrText` (clean or real OCR dump) **or** `ocrFile`
   - `expected[]` with `merchant`, `amount`, optional `paidAtDate` (`YYYY-MM-DD`)
2. Run:

```bash
cd packages/shared && npm test
```

3. Fix `history.ts` / `shared.ts` until the sample is green.
4. Optional noisy OCR samples: set `"optional": true` (warns, doesn’t fail CI).

## Generating more synthetic screenshots

From this folder:

```bash
# re-run the PIL + tesseract generator (see repo history / scripts)
python3 generate_synth.py   # if present
```

Or drop a new PNG here, OCR it:

```bash
tesseract my-shot.png my-shot-psm6 --psm 6
```

Then add a sample pointing at `my-shot-psm6.txt` with hand-labeled `expected`.

## Why amounts were wrong before

OCR often turns `₹` into `2`, `7`, `%`, `X`, or glues it onto the digits:

- `₹49,999` → `249,999` / `749,999`
- `₹100` → `2100` / `X100`
- Dates like `02 Jul 2020` were dropped → defaulted to “now”

The parser now:

1. Splits history into row blocks (`Paid to` / `Payment to` / `Received from`)
2. Repairs common ₹ OCR glue on amounts
3. Reads absolute dates (`02 Jul 2020`) and relative (`1 min ago`)
4. Skips **Failed** rows
