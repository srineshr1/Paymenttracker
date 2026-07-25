import assert from "node:assert/strict";
import { test } from "node:test";
import { isLearnableMerchantKey, normalizeMerchantKey } from "./merchant.js";

test("normalizeMerchantKey trims, lowers and collapses whitespace", () => {
  assert.equal(
    normalizeMerchantKey("  Swiggy   Instamart "),
    "swiggy instamart",
  );
  assert.equal(normalizeMerchantKey("ZOMATO"), "zomato");
  assert.equal(
    normalizeMerchantKey("Uber\tIndia\nSystems"),
    "uber india systems",
  );
});

test("normalizeMerchantKey is null-safe", () => {
  assert.equal(normalizeMerchantKey(null), "");
  assert.equal(normalizeMerchantKey(undefined), "");
  assert.equal(normalizeMerchantKey("   "), "");
});

test("normalizeMerchantKey is stable for the same merchant typed differently", () => {
  const a = normalizeMerchantKey("Blue Tokai Coffee");
  const b = normalizeMerchantKey("blue tokai   coffee ");
  assert.equal(a, b);
});

test("isLearnableMerchantKey rejects empty and absurdly long keys", () => {
  assert.equal(isLearnableMerchantKey(""), false);
  assert.equal(isLearnableMerchantKey("a"), false);
  assert.equal(isLearnableMerchantKey("ola"), true);
  assert.equal(isLearnableMerchantKey("x".repeat(200)), false);
});
