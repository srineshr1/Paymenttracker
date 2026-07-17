import {
  detectSource,
  extractAmount,
  extractDirection,
  extractMerchant,
  extractPaidAt,
  extractStatus,
  extractUpiRef,
  normalizeOcrText,
  scoreConfidence,
} from "./shared.js";
import type { ParsedExpense } from "./types.js";

const MERCHANT_PATTERNS = [
  /paid\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
  /to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})(?:\n|$)/i,
  /transfer\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
];

export function parsePhonePeOcr(raw: string): ParsedExpense {
  const rawText = normalizeOcrText(raw);
  const warnings: string[] = [];
  const source =
    detectSource(rawText) === "gpay" ? "gpay" : detectSource(rawText) === "phonepe"
      ? "phonepe"
      : "phonepe";

  const amount = extractAmount(rawText);
  const merchant = extractMerchant(rawText, MERCHANT_PATTERNS);
  const paidAt = extractPaidAt(rawText);
  const upiRef = extractUpiRef(rawText);
  const direction = extractDirection(rawText);
  const status = extractStatus(rawText);

  if (!amount) warnings.push("Could not detect amount");
  if (!merchant) warnings.push("Could not detect merchant");
  if (!paidAt) warnings.push("Could not detect date");
  if (status === "failed") warnings.push("Transaction appears failed");
  if (status === "pending") warnings.push("Transaction appears pending");

  const confidence = scoreConfidence({
    amount,
    merchant,
    paidAt,
    upiRef,
    status,
    source,
  });

  return {
    amount,
    currency: "INR",
    direction,
    merchant,
    paidAt,
    upiRef,
    source: "phonepe",
    status,
    confidence,
    rawText,
    warnings,
  };
}
