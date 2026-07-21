import { looksLikeHistoryList, parseHistoryListOcr } from "./history.js";
import { interpretTransactionText } from "./interpret.js";
import { normalizeOcrText } from "./shared.js";
import type { ParsedExpense } from "./types.js";

/**
 * Parse one or more expenses from a payment screenshot's OCR text.
 *
 * App-agnostic: works for any UPI / wallet / bank app because the shared
 * interpreter reads fields from the text itself. Multi-row history lists are
 * split into individual transactions.
 */
export function parseUpiScreenshotAll(raw: string): ParsedExpense[] {
  const text = normalizeOcrText(raw);

  if (looksLikeHistoryList(text)) {
    const list = parseHistoryListOcr(text);
    if (list.length > 0) return list;
  }

  // Single-transaction success / receipt screen.
  return [interpretTransactionText(text)];
}

export function parseUpiScreenshotText(raw: string): ParsedExpense {
  const text = normalizeOcrText(raw);

  // Prefer history if multiple rows.
  if (looksLikeHistoryList(text)) {
    const list = parseHistoryListOcr(text);
    if (list.length === 1) return list[0];
    if (list.length > 1) {
      return {
        ...list[0],
        warnings: [
          ...list[0].warnings,
          `Found ${list.length} transactions in this screenshot — pick which to save.`,
        ],
      };
    }
  }

  return interpretTransactionText(text);
}

export { parseGPayOcr } from "./gpay.js";
export * from "./history.js";
export * from "./interpret.js";
export { parsePhonePeOcr } from "./phonepe.js";
export * from "./quality.js";
export * from "./shared.js";
export * from "./sms.js";
export * from "./types.js";
