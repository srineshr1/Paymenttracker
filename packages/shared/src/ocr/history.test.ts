import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
});
