import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPaymentSms, parseSmsMessage, parseSmsMessages } from "./sms";

const HDFC = `HDFC Bank: Rs.450.00 debited from A/c **1234 on 17-07-26 to VPA swiggy@ybl. UPI Ref 417612345678. Not you? Call 18002586161`;

const SBI = `SBI: Rs 1250.50 debited from A/c XX1234 on 17Jul26 for UPI/Uber India/417698765432. Avl Bal Rs 10,000.00`;

const ICICI = `ICICI Bank Acct XX5678 debited for Rs 1,200.00 on 17-Jul-26; UPI:merchant@icici. UPI:417612345679. Call 18001080 if not you.`;

const PHONEPE = `PhonePe: Paid Rs.450 to Swiggy. UPI Ref 417612345680. Debited from HDFC Bank XX1234`;

const GPAY = `Google Pay: You paid ₹99.00 to Ravi Kumar. UPI transaction ID 123456789012 on 17 Jul 2026, 10:00 am`;

const CREDIT = `Your A/c XX1234 is credited for Rs.500.00 on 17-07-2026 from VPA friend@oksbi (UPI Ref No 417612345681)`;

const OTP = `Your OTP for login is 482910. Do not share with anyone. Valid for 5 minutes.`;

describe("isPaymentSms", () => {
  it("accepts bank debit SMS", () => {
    assert.equal(isPaymentSms(HDFC, "VM-HDFCBK"), true);
  });

  it("rejects OTP SMS", () => {
    assert.equal(isPaymentSms(OTP, "VM-HDFCBK"), false);
  });
});

describe("parseSmsMessage", () => {
  it("parses HDFC UPI debit", () => {
    const r = parseSmsMessage({ body: HDFC, address: "VM-HDFCBK" });
    assert.equal(r.source, "sms");
    assert.equal(r.amount, "450.00");
    assert.equal(r.direction, "debit");
    assert.match(r.merchant ?? "", /swiggy/i);
    assert.equal(r.upiRef, "417612345678");
    assert.ok(r.paidAt);
    assert.ok(r.confidence >= 0.6);
  });

  it("parses SBI UPI path merchant", () => {
    const r = parseSmsMessage({ body: SBI, address: "VK-SBIINB" });
    assert.equal(r.amount, "1250.50");
    assert.match(r.merchant ?? "", /Uber/i);
    assert.ok(r.upiRef);
    assert.equal(r.availableBalance, "10000.00");
  });

  it("extracts available balance from bank SMS", () => {
    const r = parseSmsMessage({ body: SBI, address: "VK-SBIINB" });
    assert.equal(r.availableBalance, "10000.00");
  });

  it("parses ICICI debit", () => {
    const r = parseSmsMessage({ body: ICICI });
    assert.equal(r.amount, "1200.00");
    assert.equal(r.direction, "debit");
    assert.ok(r.confidence >= 0.5);
  });

  it("detects PhonePe source", () => {
    const r = parseSmsMessage({ body: PHONEPE, address: "VK-PhonePe" });
    assert.equal(r.source, "phonepe");
    assert.equal(r.amount, "450.00");
    assert.match(r.merchant ?? "", /Swiggy/i);
  });

  it("detects GPay source and amount", () => {
    const r = parseSmsMessage({ body: GPAY });
    assert.equal(r.source, "gpay");
    assert.equal(r.amount, "99.00");
    assert.match(r.merchant ?? "", /Ravi/i);
  });

  it("detects credit direction", () => {
    const r = parseSmsMessage({ body: CREDIT });
    assert.equal(r.direction, "credit");
    assert.equal(r.amount, "500.00");
  });

  it("uses SMS dateMs when body has no date", () => {
    const body = `Rs.100.00 debited to VPA tea@ybl UPI Ref 999888777666`;
    const ms = Date.UTC(2026, 6, 18, 12, 0, 0);
    const r = parseSmsMessage({ body, dateMs: ms });
    assert.equal(r.amount, "100.00");
    assert.ok(r.paidAt?.startsWith("2026-07-18"));
  });
});

describe("parseSmsMessages", () => {
  it("filters OTP and returns payment rows", () => {
    const list = parseSmsMessages([
      { body: OTP, address: "VM-BANK", dateMs: 3 },
      { body: HDFC, address: "VM-HDFCBK", dateMs: 2 },
      { body: SBI, address: "VK-SBI", dateMs: 1 },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0].amount, "450.00");
  });

  it("dedupes by UPI ref", () => {
    const list = parseSmsMessages([
      { body: HDFC, dateMs: 2 },
      { body: HDFC, dateMs: 1 },
    ]);
    assert.equal(list.length, 1);
  });
});
