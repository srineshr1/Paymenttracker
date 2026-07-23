import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isJunk, isJunkForAutoImport, resolveMerchant } from "./quality";
import type { ParsedExpense } from "./types.js";

function make(over: Partial<ParsedExpense>): ParsedExpense {
  return {
    amount: "100.00",
    currency: "INR",
    direction: "debit",
    merchant: "Swiggy",
    paidAt: "2026-07-17T10:00:00.000Z",
    upiRef: "417612345678",
    source: "sms",
    status: "success",
    confidence: 0.8,
    rawText: "",
    warnings: [],
    ...over,
  };
}

describe("isJunk", () => {
  it("keeps a complete confident payment", () => {
    assert.equal(isJunk(make({})), false);
  });

  it("drops when amount is missing", () => {
    assert.equal(isJunk(make({ amount: null })), true);
  });

  it("drops failed transactions", () => {
    assert.equal(isJunk(make({ status: "failed" })), true);
  });

  it("keeps a confident payment even with no merchant (has ref)", () => {
    assert.equal(
      isJunk(make({ merchant: null, upiRef: "417600011122", confidence: 0.6 })),
      false,
    );
  });

  it("keeps a merchant-less payment when confidence is high", () => {
    assert.equal(
      isJunk(make({ merchant: null, upiRef: null, confidence: 0.65 })),
      false,
    );
  });

  it("drops a merchant-less payment with weak signal", () => {
    assert.equal(
      isJunk(make({ merchant: null, upiRef: null, confidence: 0.5 })),
      true,
    );
  });

  it("drops garbage merchant tokens with weak signal", () => {
    assert.equal(
      isJunk(make({ merchant: "to", upiRef: null, confidence: 0.5 })),
      true,
    );
  });
});

describe("isJunkForAutoImport", () => {
  it("applies the stricter 0.55 confidence bar without strong signals", () => {
    assert.equal(
      isJunkForAutoImport(
        make({ confidence: 0.5, upiRef: null, availableBalance: null }),
      ),
      true,
    );
    assert.equal(isJunkForAutoImport(make({ confidence: 0.6 })), false);
  });

  it("keeps amount+ref even slightly under the 0.55 bar", () => {
    assert.equal(
      isJunkForAutoImport(
        make({
          confidence: 0.48,
          merchant: null,
          upiRef: "289917195718",
          availableBalance: null,
        }),
      ),
      false,
    );
  });

  it("keeps amount+available balance as a strong bank signal", () => {
    assert.equal(
      isJunkForAutoImport(
        make({
          confidence: 0.5,
          merchant: null,
          upiRef: null,
          availableBalance: "999.00",
        }),
      ),
      false,
    );
  });

  it("rejects pending transactions unattended", () => {
    assert.equal(isJunkForAutoImport(make({ status: "pending" })), true);
  });
});

describe("resolveMerchant", () => {
  it("returns the detected merchant when usable", () => {
    assert.equal(resolveMerchant(make({ merchant: "Swiggy" })), "Swiggy");
  });

  it("labels ATM withdrawals", () => {
    assert.equal(
      resolveMerchant(
        make({ merchant: null, rawText: "Rs 5000 withdrawn from ATM" }),
      ),
      "ATM withdrawal",
    );
  });

  it("labels card payments", () => {
    assert.equal(
      resolveMerchant(
        make({ merchant: null, rawText: "Rs 1200 spent on Credit Card" }),
      ),
      "Card payment",
    );
  });

  it("labels credits as money received", () => {
    assert.equal(
      resolveMerchant(
        make({ merchant: null, direction: "credit", rawText: "credited" }),
      ),
      "Money received",
    );
  });

  it("defaults to UPI payment", () => {
    assert.equal(
      resolveMerchant(make({ merchant: null, rawText: "Rs 50 debited" })),
      "UPI payment",
    );
  });
});
