import type { ParsedExpense } from "./types.js";

/**
 * Quality gate shared by SMS bulk import, live auto-import, and the screenshot
 * review screen. Kept in the shared package so it is unit-tested (the mobile
 * app re-exports these).
 */

/** Live auto-import and unattended bulk SMS import. */
export const MIN_AUTO_IMPORT_CONFIDENCE = 0.55;

/** Multi-select review UI — slightly looser so users can still opt in. */
export const MIN_REVIEW_CONFIDENCE = 0.45;

export type IsJunkOptions = {
  /** Default: MIN_REVIEW_CONFIDENCE (0.45). */
  minConfidence?: number;
  /** When true, treat pending UPI SMS like failed (unattended paths). */
  rejectPending?: boolean;
};

const GARBAGE_MERCHANT_RE =
  /^(zl|to|from|paid|sent|received|via|na|n\/a|null|unknown)$/i;

/** A merchant token that is present and actually usable (not UI chrome). */
function merchantUsable(merchant: string | null | undefined): boolean {
  const m = (merchant ?? "").trim();
  return m.length >= 3 && !GARBAGE_MERCHANT_RE.test(m);
}

/**
 * Strong enough to auto-save even with a weak/missing merchant:
 * amount + (UPI/ref OR bank available balance) with a floor confidence.
 * Matches real bank SMS that omit a clean merchant name.
 */
export function hasStrongPaymentSignal(item: ParsedExpense): boolean {
  if (!item.amount) return false;
  if (item.status === "failed" || item.status === "pending") return false;
  const conf = item.confidence ?? 0;
  if (conf < 0.4) return false;
  return Boolean(item.upiRef) || Boolean(item.availableBalance);
}

/**
 * Whether a parsed payment is too weak / incomplete to import.
 *
 * A confident payment is NOT dropped just because the merchant is missing — a
 * sensible label is applied later via {@link resolveMerchant}. It is dropped
 * only when the merchant is weak AND there is no other strong signal
 * (no reference id and confidence below 0.6).
 */
export function isJunk(item: ParsedExpense, opts: IsJunkOptions = {}): boolean {
  const minConf = opts.minConfidence ?? MIN_REVIEW_CONFIDENCE;
  const rejectPending = opts.rejectPending ?? false;

  if (!item.amount) return true;
  if (item.status === "failed") return true;
  if (rejectPending && item.status === "pending") return true;

  // Amount + ref/balance is enough even when confidence is a bit soft or
  // merchant is missing (common on compact bank SMS).
  if (hasStrongPaymentSignal(item)) return false;

  if ((item.confidence ?? 0) < minConf) return true;

  if (!merchantUsable(item.merchant)) {
    const strong = Boolean(item.upiRef) || (item.confidence ?? 0) >= 0.6;
    return !strong;
  }
  return false;
}

/** Strict filter for unattended bulk / live import (no review UI). */
export function isJunkForAutoImport(item: ParsedExpense): boolean {
  return isJunk(item, {
    minConfidence: MIN_AUTO_IMPORT_CONFIDENCE,
    rejectPending: true,
  });
}

/**
 * Human-readable reason a parsed row fails the auto-import gate
 * (for skipped-message UI). Returns null when the row is importable.
 */
export function autoImportSkipReason(
  item: ParsedExpense,
): "no_amount" | "failed_tx" | "pending_tx" | "low_confidence" | "junk" | null {
  if (!item.amount) return "no_amount";
  if (item.status === "failed") return "failed_tx";
  if (item.status === "pending") return "pending_tx";
  if (isJunkForAutoImport(item)) {
    if ((item.confidence ?? 0) < MIN_AUTO_IMPORT_CONFIDENCE) {
      return "low_confidence";
    }
    return "junk";
  }
  return null;
}

/**
 * Best display merchant for a parsed payment. Returns the detected merchant
 * when usable, otherwise a sensible fallback inferred from the text / direction
 * (so confident but merchant-less payments still save with a meaningful label).
 */
export function resolveMerchant(
  item: Pick<ParsedExpense, "merchant" | "direction" | "rawText">,
): string {
  const m = (item.merchant ?? "").trim();
  if (m.length >= 2 && !GARBAGE_MERCHANT_RE.test(m)) return m;

  const raw = item.rawText ?? "";
  if (/\batm\b|withdrawn|withdrawal/i.test(raw)) return "ATM withdrawal";
  if (/\b(?:emi|loan)\b/i.test(raw)) return "EMI / loan";
  if (/\bmandate|auto\s*pay|autopay/i.test(raw)) return "Autopay";
  if (/\bcard\b/i.test(raw)) return "Card payment";
  if (item.direction === "credit") return "Money received";
  return "UPI payment";
}

export function dayKey(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "unknown";
  }
}

/** Safe ISO paidAt for batch payloads (invalid dates fall back to now). */
export function safePaidAtIso(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString();
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return new Date().toISOString();
  return new Date(t).toISOString();
}
