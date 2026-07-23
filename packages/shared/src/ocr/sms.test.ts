import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isJunkForAutoImport } from "./quality";
import { isPaymentSms, parseSmsMessage, parseSmsMessages } from "./sms";

const HDFC = `HDFC Bank: Rs.450.00 debited from A/c **1234 on 17-07-26 to VPA swiggy@ybl. UPI Ref 417612345678. Not you? Call 18002586161`;

const SBI = `SBI: Rs 1250.50 debited from A/c XX1234 on 17Jul26 for UPI/Uber India/417698765432. Avl Bal Rs 10,000.00`;

const ICICI = `ICICI Bank Acct XX5678 debited for Rs 1,200.00 on 17-Jul-26; UPI:merchant@icici. UPI:417612345679. Call 18001080 if not you.`;

const PHONEPE = `PhonePe: Paid Rs.450 to Swiggy. UPI Ref 417612345680. Debited from HDFC Bank XX1234`;

const GPAY = `Google Pay: You paid ₹99.00 to Ravi Kumar. UPI transaction ID 123456789012 on 17 Jul 2026, 10:00 am`;

const CREDIT = `Your A/c XX1234 is credited for Rs.500.00 on 17-07-2026 from VPA friend@oksbi (UPI Ref No 417612345681)`;

const OTP = `Your OTP for login is 482910. Do not share with anyone. Valid for 5 minutes.`;

// Reported Union Bank of India messages (verbatim) that use the compact
// "Rs:<amount>" colon form the importer currently drops.
const UNION1 =
  "Union Bank of India A/c *0008 Debited Rs:25.00 on 20-07-2026 15:46:17 by Mob Bk ref no 289917195718, Fvg: MS K  SA Avl Bal Rs:999.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472";
const UNION2 =
  "Union Bank of India A/c *0008 Debited Rs:2.00 on 21-07-2026 21:42:34 by Mob Bk ref no 620230268587, Fvg: AWS Indi Avl Bal Rs:712.00. Not you?Call 18002333/SMS BLOCK 0008 to 8879365472";

describe("isPaymentSms", () => {
  it("accepts bank debit SMS", () => {
    assert.equal(isPaymentSms(HDFC, "VM-HDFCBK"), true);
  });

  it("accepts card spend SMS", () => {
    assert.equal(
      isPaymentSms(
        "INR 2,499.00 spent on AXIS Bank Card ending 1234 at FLIPKART on 17-07-26. Avl Limit INR 50,000.00",
        "AX-AXISBK",
      ),
      true,
    );
  });

  it("accepts ATM withdrawal SMS", () => {
    assert.equal(
      isPaymentSms(
        "Rs 5,000.00 withdrawn from HDFC Bank ATM at MG Road on 17-07-26. Avl Bal Rs 22,340.00",
        "VM-HDFCBK",
      ),
      true,
    );
  });

  it("accepts UPI autopay / mandate SMS", () => {
    assert.equal(
      isPaymentSms(
        "Rs 199.00 debited via UPI AutoPay mandate to Netflix from Kotak A/c XX9988 on 17/07/2026. Ref 417600011122",
        "VM-KOTAK",
      ),
      true,
    );
  });

  it("rejects OTP SMS", () => {
    assert.equal(isPaymentSms(OTP, "VM-HDFCBK"), false);
  });

  it("rejects promotional SMS with no transaction", () => {
    assert.equal(
      isPaymentSms(
        "Get FLAT 50% OFF up to Rs 200 on your next order! Use code SAVE50. Limited period offer, hurry!",
        "VM-PROMOS",
      ),
      false,
    );
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

// Bug-condition exploration: currency tokens separated from the amount by a
// colon (e.g. "Rs:25.00"). These are EXPECTED TO FAIL on the current, unfixed
// parser — the failure reproduces and proves the reported bug.
describe("colon-separated currency amounts (Rs:25.00) — bug reproduction", () => {
  const CURRENCIES = ["₹", "Rs", "Rs.", "INR"];
  const SEPARATORS = ["", " ", ":", ": "];
  const AMOUNTS = ["25.00", "2.00", "1,250.50"];
  // Amounts already carry 2 decimals; normalization only strips grouping commas
  // ("1,250.50" -> "1250.50") to match what the interpreter emits.
  const normalize = (amt: string): string => amt.replace(/,/g, "");

  it("detects and extracts the amount across currency/separator/amount combos", () => {
    const failures: string[] = [];
    for (const cur of CURRENCIES) {
      for (const sep of SEPARATORS) {
        // Keep tokens well-formed: only "₹" glues directly to the number, so
        // skip the empty separator for the multi-char textual tokens.
        if (sep === "" && cur !== "₹") continue;
        for (const amt of AMOUNTS) {
          const body = `ICICI A/c XX debited ${cur}${sep}${amt} ref 417600011122`;
          const expected = normalize(amt);
          const detected = isPaymentSms(body);
          const parsedAmount = parseSmsMessage({ body }).amount;
          if (detected !== true || parsedAmount !== expected) {
            failures.push(
              `cur=${JSON.stringify(cur)} sep=${JSON.stringify(sep)} amt=${JSON.stringify(amt)} -> ` +
                `isPaymentSms=${detected}, amount=${JSON.stringify(parsedAmount)} (expected ${JSON.stringify(expected)})`,
            );
          }
        }
      }
    }
    assert.equal(
      failures.length,
      0,
      `colon/separator combos not handled:\n${failures.join("\n")}`,
    );
  });
});

describe("Union Bank of India colon-format messages", () => {
  it("recognizes both reported messages as payments", () => {
    assert.equal(isPaymentSms(UNION1), true);
    assert.equal(isPaymentSms(UNION2), true);
  });

  it("parses UNION1 (Rs:25.00) fields", () => {
    const r = parseSmsMessage({ body: UNION1 });
    assert.equal(r.amount, "25.00");
    assert.equal(r.direction, "debit");
    assert.equal(r.availableBalance, "999.00");
    assert.equal(r.upiRef, "289917195718");
    assert.ok(r.paidAt?.startsWith("2026-07-20"), `paidAt ${r.paidAt}`);
  });

  it("parses UNION2 (Rs:2.00) fields", () => {
    const r = parseSmsMessage({ body: UNION2 });
    assert.equal(r.amount, "2.00");
    assert.equal(r.availableBalance, "712.00");
    assert.equal(r.upiRef, "620230268587");
  });

  it("captures the Fvg beneficiary as merchant (trimming account-type code)", () => {
    // UNION1: "Fvg: MS K  SA Avl Bal ..." → beneficiary "MS K" (trailing "SA" trimmed).
    assert.match(parseSmsMessage({ body: UNION1 }).merchant ?? "", /MS K/);
    // UNION2: "Fvg: AWS Indi Avl Bal ..." → beneficiary "AWS Indi" (no code to trim).
    assert.match(parseSmsMessage({ body: UNION2 }).merchant ?? "", /AWS Indi/);
  });

  it("retains both messages through parseSmsMessages", () => {
    const list = parseSmsMessages([{ body: UNION1 }, { body: UNION2 }]);
    assert.equal(list.length, 2);
  });
});

// End-to-end import-quality gate: parsing correctly is not enough — the two
// reported messages must also clear the unattended auto-import threshold
// (confidence >= MIN_AUTO_IMPORT_CONFIDENCE = 0.55) and not be treated as junk.
describe("Union Bank colon-format messages — import eligibility", () => {
  it("UNION1 clears the auto-import confidence threshold and is not junk", () => {
    const r = parseSmsMessage({ body: UNION1 });
    assert.ok(
      r.confidence >= 0.55,
      `UNION1 confidence ${r.confidence} should be >= 0.55`,
    );
    assert.equal(isJunkForAutoImport(r), false);
  });

  it("UNION2 clears the auto-import confidence threshold and is not junk", () => {
    const r = parseSmsMessage({ body: UNION2 });
    assert.ok(
      r.confidence >= 0.55,
      `UNION2 confidence ${r.confidence} should be >= 0.55`,
    );
    assert.equal(isJunkForAutoImport(r), false);
  });
});
