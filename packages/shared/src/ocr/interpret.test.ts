import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBestAmount,
  extractBestMerchant,
  interpretTransactionText,
} from "./interpret";

describe("extractBestAmount — picks txn amount over distractors", () => {
  it("prefers debited amount over available balance", () => {
    const t =
      "Rs.450.00 debited from A/c **1234 on 17-07-26 to VPA swiggy@ybl. Avl Bal Rs 10,000.00";
    assert.equal(extractBestAmount(t), "450.00");
  });

  it("ignores 12-digit reference numbers", () => {
    const t = "Paid Rs 250 to Uber. UPI Ref 417612345678";
    assert.equal(extractBestAmount(t), "250.00");
  });

  it("ignores account / card masks", () => {
    const t = "INR 1,299.00 spent on Card ending 4321 at AMAZON on 17-07-26";
    assert.equal(extractBestAmount(t), "1299.00");
  });

  it("ignores credit-limit footers", () => {
    const t =
      "Rs 3,500.75 spent on HDFC Credit Card at SWIGGY. Avl Limit Rs 45,000.00";
    assert.equal(extractBestAmount(t), "3500.75");
  });

  it("returns null when there is no amount", () => {
    assert.equal(extractBestAmount("Your OTP is 482910. Do not share."), null);
  });
});

describe("extractBestMerchant — app-agnostic", () => {
  it("reads VPA local part", () => {
    assert.match(
      extractBestMerchant("paid to swiggy@ybl", "debit") ?? "",
      /swiggy/i,
    );
  });

  it("reads 'paid to Name'", () => {
    assert.match(
      extractBestMerchant("You paid Rs 99 to Ravi Kumar.", "debit") ?? "",
      /Ravi/i,
    );
  });

  it("reads 'spent at MERCHANT'", () => {
    assert.match(
      extractBestMerchant("Rs 1,299 spent at AMAZON on card", "debit") ?? "",
      /amazon/i,
    );
  });

  it("does not return a bare bank name as merchant", () => {
    const m = extractBestMerchant("Rs 500 debited from HDFC Bank", "debit");
    assert.equal(m, null);
  });
});

describe("interpretTransactionText — many banks", () => {
  const cases: {
    name: string;
    body: string;
    address?: string;
    amount: string;
    direction: "debit" | "credit";
    merchant?: RegExp;
  }[] = [
    {
      name: "HDFC UPI debit",
      body: "HDFC Bank: Rs.450.00 debited from A/c **1234 on 17-07-26 to VPA swiggy@ybl. UPI Ref 417612345678. Avl Bal Rs 10,000.00",
      address: "VM-HDFCBK",
      amount: "450.00",
      direction: "debit",
      merchant: /swiggy/i,
    },
    {
      name: "SBI UPI path merchant",
      body: "SBI: Rs 1250.50 debited from A/c XX1234 on 17Jul26 for UPI/Uber India/417698765432. Avl Bal Rs 10,000.00",
      address: "VK-SBIINB",
      amount: "1250.50",
      direction: "debit",
      merchant: /uber/i,
    },
    {
      name: "ICICI debit",
      body: "ICICI Bank Acct XX5678 debited for Rs 1,200.00 on 17-Jul-26; UPI:merchant@icici. UPI:417612345679.",
      amount: "1200.00",
      direction: "debit",
    },
    {
      name: "Axis card spend",
      body: "INR 2,499.00 spent on AXIS Bank Card ending 1234 at FLIPKART on 17-07-26. Avl Limit INR 50,000.00",
      address: "AX-AXISBK",
      amount: "2499.00",
      direction: "debit",
      merchant: /flipkart/i,
    },
    {
      name: "Kotak auto-debit / mandate",
      body: "Rs 199.00 debited via UPI AutoPay mandate to Netflix from Kotak A/c XX9988 on 17/07/2026. Ref 417600011122",
      address: "VM-KOTAK",
      amount: "199.00",
      direction: "debit",
      merchant: /netflix/i,
    },
    {
      name: "credit received",
      body: "Your A/c XX1234 is credited for Rs.500.00 on 17-07-2026 from VPA friend@oksbi (UPI Ref No 417612345681)",
      amount: "500.00",
      direction: "credit",
    },
    {
      name: "ATM withdrawal",
      body: "Rs 5,000.00 withdrawn from HDFC Bank ATM at MG Road on 17-07-26. Avl Bal Rs 22,340.00",
      address: "VM-HDFCBK",
      amount: "5000.00",
      direction: "debit",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = interpretTransactionText(c.body, {
        address: c.address,
        isSms: true,
      });
      assert.equal(r.amount, c.amount, "amount");
      assert.equal(r.direction, c.direction, "direction");
      if (c.merchant) {
        assert.match(r.merchant ?? "", c.merchant, "merchant");
      }
      assert.ok(r.paidAt, "paidAt");
    });
  }
});

describe("interpretTransactionText — payment app screenshots (any brand)", () => {
  it("parses a Paytm success screen", () => {
    const r = interpretTransactionText(
      `Paytm\nPayment Successful\n₹350.00\nPaid to Blinkit\n17 Jul 2026, 08:42 pm\nUPI Ref No. 417612345678`,
    );
    assert.equal(r.amount, "350.00");
    assert.match(r.merchant ?? "", /blinkit/i);
    assert.equal(r.source, "upi");
    assert.equal(r.status, "success");
  });

  it("parses a CRED / generic screen and marks source upi", () => {
    const r = interpretTransactionText(
      `CRED\nPaid to Zomato\n₹1,240.00\n17 July 2026 at 09:15 am\nTransaction ID 417698765432`,
    );
    assert.equal(r.amount, "1240.00");
    assert.match(r.merchant ?? "", /zomato/i);
    assert.equal(r.source, "upi");
  });

  it("keeps a caller source hint (brand from OCR logo)", () => {
    const r = interpretTransactionText(
      `Payment Successful\n₹99.00\nPaid to Ravi`,
      { source: "phonepe" },
    );
    assert.equal(r.source, "phonepe");
  });

  it("falls back to unknown for an unbranded screenshot", () => {
    const r = interpretTransactionText(`Paid to Local Store\n₹75.00`);
    assert.equal(r.source, "unknown");
    assert.equal(r.amount, "75.00");
  });
});

describe("interpretTransactionText — confidence + dates", () => {
  it("uses dateMs fallback when body has no date", () => {
    const ms = Date.UTC(2026, 6, 18, 12, 0, 0);
    const r = interpretTransactionText(
      "Rs.100.00 debited to VPA tea@ybl UPI Ref 999888777666",
      { dateMs: ms, isSms: true },
    );
    assert.equal(r.amount, "100.00");
    assert.ok(r.paidAt?.startsWith("2026-07-18"));
  });

  it("gives complete UPI debits solid confidence", () => {
    const r = interpretTransactionText(
      "HDFC Bank: Rs.450.00 debited from A/c **1234 on 17-07-26 to VPA swiggy@ybl. UPI Ref 417612345678",
      { address: "VM-HDFCBK", isSms: true },
    );
    assert.ok(r.confidence >= 0.6, `confidence ${r.confidence}`);
  });

  it("caps confidence for non-payment text", () => {
    const r = interpretTransactionText("Meeting at 5pm, bring Rs 200 cash");
    assert.ok(r.confidence <= 0.4, `confidence ${r.confidence}`);
  });
});
