import { interpretTransactionText } from "./interpret.js";
import type { ParsedExpense } from "./types.js";

/**
 * Google Pay screenshot parser — kept for back-compat. Delegates to the shared
 * interpreter with a GPay source hint (the field logic is app-agnostic).
 */
export function parseGPayOcr(raw: string): ParsedExpense {
  return interpretTransactionText(raw, { source: "gpay" });
}
