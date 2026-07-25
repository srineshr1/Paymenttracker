/**
 * Merchant name normalization shared by search and merchant→category learning.
 * Keep this pure: the mobile vault stores only a hash of the normalized key.
 */

/**
 * Canonical lookup key for a merchant string.
 * Unicode-normalized, lower-cased, whitespace collapsed, trimmed.
 *
 * "  Swiggy   Instamart " → "swiggy instamart"
 */
export function normalizeMerchantKey(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw)
    .normalize("NFKC")
    .replace(/[\u00a0\u2000-\u200b\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when the key is usable for learning / lookup. */
export function isLearnableMerchantKey(key: string): boolean {
  return key.length >= 2 && key.length <= 120;
}
