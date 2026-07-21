import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUpiScreenshotText } from "./parse";

const PHONEPE_SAMPLE = `
PhonePe
Payment Successful
₹450.00
Paid to Swiggy
Transaction ID
T2407171234567890123456
17 Jul 2026, 08:42 pm
UPI Ref No. 417612345678
Debited from
HDFC Bank XX1234
`;

const GPAY_SAMPLE = `
Google Pay
Payment successful
₹1,250.50
Paid to Uber India
17 July 2026 at 09:15 am
UPI transaction ID
417698765432
From
State Bank of India
`;

describe("parseUpiScreenshotText", () => {
  it("parses PhonePe success screenshot text", () => {
    const r = parseUpiScreenshotText(PHONEPE_SAMPLE);
    assert.equal(r.source, "phonepe");
    assert.equal(r.amount, "450.00");
    assert.equal(r.direction, "debit");
    assert.match(r.merchant ?? "", /Swiggy/i);
    assert.ok(r.paidAt);
    assert.ok(r.upiRef);
    assert.ok(r.confidence >= 0.7);
    assert.equal(r.status, "success");
  });

  it("parses GPay success screenshot text", () => {
    const r = parseUpiScreenshotText(GPAY_SAMPLE);
    assert.equal(r.source, "gpay");
    assert.equal(r.amount, "1250.50");
    assert.match(r.merchant ?? "", /Uber/i);
    assert.ok(r.paidAt);
    assert.ok(r.confidence >= 0.7);
  });

  it("detects credit direction for received payments", () => {
    const r = parseUpiScreenshotText(`
Google Pay
Payment successful
You received ₹99.00
Received from Ravi Kumar
17 Jul 2026, 10:00 am
UPI transaction ID 123456789012
`);
    assert.equal(r.direction, "credit");
    assert.equal(r.amount, "99.00");
  });

  it("parses a Paytm screenshot with a neutral upi source", () => {
    const r = parseUpiScreenshotText(`
Paytm
Payment Successful
₹350.00
Paid to Blinkit
17 Jul 2026, 08:42 pm
UPI Ref No. 417612345678
`);
    assert.equal(r.amount, "350.00");
    assert.match(r.merchant ?? "", /blinkit/i);
    assert.equal(r.source, "upi");
    assert.equal(r.status, "success");
  });

  it("parses an unbranded app screenshot (source unknown, still extracts fields)", () => {
    const r = parseUpiScreenshotText(`
Payment Successful
₹1,299.00
Paid to Croma Retail
Transaction ID 417698765432
`);
    assert.equal(r.amount, "1299.00");
    assert.match(r.merchant ?? "", /croma/i);
    assert.equal(r.source, "unknown");
  });
});
