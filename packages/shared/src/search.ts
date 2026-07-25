/**
 * Pure, on-device expense search matching.
 *
 * Merchant / notes / amount live encrypted in the local vault, so the mobile
 * app decrypts a page of rows and matches them here in memory. No SQL LIKE on
 * ciphertext, no plaintext index on disk.
 */

export type ExpenseSearchFields = {
  merchant?: string | null;
  notes?: string | null;
  amount?: string | null;
  categoryName?: string | null;
  upiRef?: string | null;
};

function normalize(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Search text with grouping separators removed so "1,250" matches "1250.00". */
function normalizeNumeric(value: string | null | undefined): string {
  return normalize(value).replace(/[,\s₹]/g, "");
}

/** Split a raw query into non-empty lower-cased tokens. */
export function searchTokens(query: string | null | undefined): string[] {
  return normalize(query).split(" ").filter(Boolean);
}

function fieldMatches(fields: ExpenseSearchFields, token: string): boolean {
  const numericToken = normalizeNumeric(token);
  if (normalize(fields.merchant).includes(token)) return true;
  if (normalize(fields.notes).includes(token)) return true;
  if (normalize(fields.categoryName).includes(token)) return true;
  if (normalize(fields.upiRef).includes(token)) return true;
  if (
    numericToken &&
    /[\d.]/.test(numericToken) &&
    normalizeNumeric(fields.amount).includes(numericToken)
  ) {
    return true;
  }
  return false;
}

/**
 * Every token must match at least one field (AND across tokens, OR across
 * fields), so "swiggy 250" narrows instead of widening.
 */
export function matchesExpenseSearch(
  fields: ExpenseSearchFields,
  query: string | null | undefined,
): boolean {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  return tokens.every((t) => fieldMatches(fields, t));
}
