import {
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
  /paid\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
  /to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})(?:\n|$)/i,
  /payment\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
  /sent\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
  /received\s+from\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,80})/i,
];

export function parseGPayOcr(raw: string): ParsedExpense {
  const rawText = normalizeOcrText(raw);
  const warnings: string[] = [];

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
    source: "gpay",
  });

  return {
    amount,
    currency: "INR",
    direction,
    merchant,
    paidAt,
    upiRef,
    source: "gpay",
    status,
    confidence,
    rawText,
    warnings,
  };
}
