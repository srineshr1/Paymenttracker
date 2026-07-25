import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesExpenseSearch, searchTokens } from "./search.js";

const row = {
  merchant: "Swiggy Instamart",
  notes: "Weekly groceries",
  amount: "1250.00",
  categoryName: "Food",
  upiRef: "T2401ABC999",
};

test("empty query matches everything", () => {
  assert.equal(matchesExpenseSearch(row, ""), true);
  assert.equal(matchesExpenseSearch(row, "   "), true);
  assert.equal(matchesExpenseSearch(row, null), true);
});

test("matches merchant case-insensitively", () => {
  assert.equal(matchesExpenseSearch(row, "swiggy"), true);
  assert.equal(matchesExpenseSearch(row, "INSTAMART"), true);
  assert.equal(matchesExpenseSearch(row, "zomato"), false);
});

test("matches notes and category name", () => {
  assert.equal(matchesExpenseSearch(row, "groceries"), true);
  assert.equal(matchesExpenseSearch(row, "food"), true);
});

test("matches amount ignoring grouping separators", () => {
  assert.equal(matchesExpenseSearch(row, "1250"), true);
  assert.equal(matchesExpenseSearch(row, "1,250"), true);
  assert.equal(matchesExpenseSearch(row, "₹1250"), true);
  assert.equal(matchesExpenseSearch(row, "999999"), false);
});

test("all tokens must match (AND semantics)", () => {
  assert.equal(matchesExpenseSearch(row, "swiggy 1250"), true);
  assert.equal(matchesExpenseSearch(row, "swiggy 77"), false);
});

test("matches upi reference", () => {
  assert.equal(matchesExpenseSearch(row, "t2401abc999"), true);
});

test("handles missing fields", () => {
  assert.equal(matchesExpenseSearch({ merchant: "Ola" }, "ola"), true);
  assert.equal(matchesExpenseSearch({ merchant: null }, "ola"), false);
});

test("searchTokens splits and normalizes", () => {
  assert.deepEqual(searchTokens("  Swiggy   250 "), ["swiggy", "250"]);
  assert.deepEqual(searchTokens(""), []);
});
