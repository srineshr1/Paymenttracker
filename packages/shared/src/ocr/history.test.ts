import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUpiScreenshotAll } from "./parse.js";

/** Realistic Tesseract-ish dump from PhonePe history (₹ often → 7 or %) */
const HISTORY_OCR = `
937 Add Address
search by name, number or UPI ID
Month Categories Filters
2 Paid to 74,000
Mourvi Agencies
3 mins ago Debited from
2 Paid to 74,220
KONAPALA AKASH
2 days ago Debited from
2 Paid to %5,000
KONAPALA AKASH
2 days ago Debited from
2 Paid to %5,000
VENKATA POTANNA GUPTA TUNUGUNTALA
3 days ago Debited from
Paid to
Gangadhar
6 days ago Debited from
Home Stores Insurance Wealth History
`;

/**
 * GPay History screenshot layout (ML Kit often stacks lines):
 *   Paid to
 *   Indian Oil Petrol Pump - …
 *   1 day ago
 *   Debited from
 *   ₹110
 *
 * Regression: "1 day ago" must NOT become amount ₹1.
 */
const GPAY_HISTORY_STACKED = `
History
Search
Paid to
Indian Oil Petrol Pump - IOCL
1 day ago
Debited from
₹110
Paid to
MADRAS FILTER COFFEE
1 day ago
Debited from
₹25
Paid to
Nikhil @MVSR
1 day ago
Debited from
₹18
Paid to
Nikhil @MVSR
1 day ago
Debited from
₹2
Received from
Nikhil1 @MVSR
1 day ago
Credited to GPay
+ ₹2
`;

/** Amount on the same line as the row label (cleaner OCR). */
const GPAY_HISTORY_INLINE = `
History
Paid to                    ₹110
Indian Oil Petrol Pump - IOCL
1 day ago              Debited from
Paid to                    ₹25
MADRAS FILTER COFFEE
1 day ago              Debited from
Paid to                    ₹18
Nikhil @MVSR
1 day ago              Debited from
Paid to                    ₹2
Nikhil @MVSR
1 day ago              Debited from
Received from              + ₹2
Nikhil1 @MVSR
1 day ago              Credited to
`;

/** Bare amounts after relative time (no ₹ glyph from OCR). */
const GPAY_HISTORY_BARE_AMOUNTS = `
Paid to
Indian Oil Petrol Pump
1 day ago Debited from 110
Paid to
Nikhil @MVSR
1 day ago
18
`;

describe("parseUpiScreenshotAll history list", () => {
  it("extracts multiple PhonePe history rows with amounts and merchants", () => {
    const all = parseUpiScreenshotAll(HISTORY_OCR);
    assert.ok(all.length >= 4, `expected >=4 rows, got ${all.length}`);

    const first = all[0];
    assert.equal(first.amount, "4000.00");
    assert.match(first.merchant ?? "", /Mourvi/i);
    assert.equal(first.direction, "debit");
    assert.ok(first.paidAt);

    const second = all[1];
    assert.equal(second.amount, "4220.00");
    assert.match(second.merchant ?? "", /KONAPALA/i);
  });

  it("does not treat '1 day ago' as ₹1 on GPay stacked history OCR", () => {
    const all = parseUpiScreenshotAll(GPAY_HISTORY_STACKED);
    assert.equal(all.length, 5, `expected 5 rows, got ${all.length}`);

    assert.equal(all[0].amount, "110.00");
    assert.match(all[0].merchant ?? "", /Indian Oil/i);

    // "FILTER" in merchant name must not be dropped as UI chrome
    assert.equal(all[1].amount, "25.00");
    assert.match(all[1].merchant ?? "", /MADRAS FILTER COFFEE/i);

    assert.equal(all[2].amount, "18.00");
    assert.match(all[2].merchant ?? "", /Nikhil/i);

    assert.equal(all[3].amount, "2.00");
    assert.equal(all[3].direction, "debit");

    assert.equal(all[4].amount, "2.00");
    assert.equal(all[4].direction, "credit");
    assert.match(all[4].merchant ?? "", /Nikhil/i);

    // No row should still be the false "1.00" from relative time
    for (const row of all) {
      assert.notEqual(
        row.amount,
        "1.00",
        `unexpected ₹1 from relative time: ${row.merchant}`,
      );
    }
  });

  it("parses GPay history with amounts on the Paid to line", () => {
    const all = parseUpiScreenshotAll(GPAY_HISTORY_INLINE);
    assert.equal(all.length, 5);
    assert.equal(all[0].amount, "110.00");
    assert.equal(all[1].amount, "25.00");
    assert.match(all[1].merchant ?? "", /MADRAS/i);
    assert.equal(all[2].amount, "18.00");
    assert.equal(all[3].amount, "2.00");
    assert.equal(all[4].amount, "2.00");
    assert.equal(all[4].direction, "credit");
  });

  it("prefers bare amount after stripping relative time (no ₹ glyph)", () => {
    const all = parseUpiScreenshotAll(GPAY_HISTORY_BARE_AMOUNTS);
    assert.ok(all.length >= 2, `expected >=2 rows, got ${all.length}`);
    assert.equal(all[0].amount, "110.00");
    assert.match(all[0].merchant ?? "", /Indian Oil/i);
    assert.equal(all[1].amount, "18.00");
    assert.match(all[1].merchant ?? "", /Nikhil/i);
  });
});
