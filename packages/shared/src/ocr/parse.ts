import { parseGPayOcr } from "./gpay.js";
import { looksLikeHistoryList, parseHistoryListOcr } from "./history.js";
import { parsePhonePeOcr } from "./phonepe.js";
import { detectSource, normalizeOcrText } from "./shared.js";
import type { ParsedExpense } from "./types.js";

/**
 * Parse one or more expenses from UPI screenshot OCR text.
 * Handles single success screens and multi-row PhonePe/GPay history lists.
 */
export function parseUpiScreenshotAll(raw: string): ParsedExpense[] {
  const text = normalizeOcrText(raw);

  if (looksLikeHistoryList(text)) {
    const list = parseHistoryListOcr(text);
    if (list.length > 0) return list;
  }

  // Single-transaction success screen
  return [parseUpiScreenshotText(text)];
}

export function parseUpiScreenshotText(raw: string): ParsedExpense {
  const text = normalizeOcrText(raw);

  // Prefer history if multiple rows
  if (looksLikeHistoryList(text)) {
    const list = parseHistoryListOcr(text);
    if (list.length === 1) return list[0];
    if (list.length > 1) {
      // Return first with a note — callers should use parseUpiScreenshotAll
      return {
        ...list[0],
        warnings: [
          ...list[0].warnings,
          `Found ${list.length} transactions in this screenshot — pick which to save.`,
        ],
      };
    }
  }

  const source = detectSource(text);

  if (source === "gpay") return parseGPayOcr(text);
  if (source === "phonepe") return parsePhonePeOcr(text);

  const phonepe = parsePhonePeOcr(text);
  const gpay = parseGPayOcr(text);
  const best = gpay.confidence >= phonepe.confidence ? gpay : phonepe;

  // If history-like "Paid to" still, try list parser once more
  if (best.confidence < 0.5 && /paid\s+to/i.test(text)) {
    const list = parseHistoryListOcr(text);
    if (list.length > 0) {
      return list.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    }
  }

  return {
    ...best,
    source: best.source === "unknown" ? "unknown" : best.source,
    warnings:
      best.source === "unknown" || best.confidence < 0.5
        ? [
            ...best.warnings,
            "Could not confidently detect PhonePe or GPay — please verify fields",
          ]
        : best.warnings,
  };
}

export * from "./types.js";
export * from "./shared.js";
export * from "./history.js";
export * from "./sms.js";
export { parsePhonePeOcr } from "./phonepe.js";
export { parseGPayOcr } from "./gpay.js";
