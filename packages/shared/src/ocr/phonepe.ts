import { interpretTransactionText } from "./interpret.js";
import type { ParsedExpense } from "./types.js";

/**
 * PhonePe screenshot parser — kept for back-compat. Delegates to the shared
 * interpreter with a PhonePe source hint (the field logic is app-agnostic).
 */
export function parsePhonePeOcr(raw: string): ParsedExpense {
  return interpretTransactionText(raw, { source: "phonepe" });
}
