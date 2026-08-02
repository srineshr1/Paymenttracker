import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorizePayment, inferCategorySlug } from "./categorize.js";

describe("categorizePayment", () => {
  it("classifies known food merchants", () => {
    const r = categorizePayment({ merchant: "Swiggy", direction: "debit" });
    assert.equal(r.slug, "food");
    assert.equal(r.confidence, "high");
  });

  it("does not treat PhonePe rail as transfer", () => {
    const r = categorizePayment({
      merchant: "Swiggy",
      direction: "debit",
      rawText: "Rs.250 debited via PhonePe UPI to Swiggy. Avl Bal Rs.1000",
    });
    assert.equal(r.slug, "food");
  });

  it("finds brand in SMS when merchant is generic", () => {
    const r = categorizePayment({
      merchant: "UPI Payment",
      direction: "debit",
      rawText: "Paid Rs 120 to Netflix via GPay",
    });
    assert.equal(r.slug, "entertainment");
  });

  it("credits without brand default to transfer", () => {
    const r = categorizePayment({
      merchant: "Rahul Sharma",
      direction: "credit",
      rawText: "INR 500 credited to your a/c via UPI from Rahul Sharma",
    });
    assert.equal(r.slug, "transfer");
  });

  it("does not force transfer just because GPay is mentioned", () => {
    const r = categorizePayment({
      merchant: "Unknown Mart",
      direction: "debit",
      rawText: "You paid Rs 99 via Google Pay",
    });
    assert.notEqual(r.slug, "transfer");
  });

  it("inferCategorySlug matches categorizePayment", () => {
    assert.equal(inferCategorySlug("Uber", "debit"), "travel");
    assert.equal(inferCategorySlug("Airtel", "debit", "recharge"), "bills");
  });
});
