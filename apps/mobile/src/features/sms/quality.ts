import type { ParsedExpense } from "@paymenttracker/shared";

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

/**
 * Whether a parsed payment is too weak / incomplete to auto-import.
 * Shared by SMS bulk import and the screenshot multi-select screen.
 */
export function isJunk(
  item: ParsedExpense,
  opts: IsJunkOptions = {},
): boolean {
  const minConf = opts.minConfidence ?? MIN_REVIEW_CONFIDENCE;
  const rejectPending = opts.rejectPending ?? false;
  const m = (item.merchant ?? "").trim();
  if (!item.amount) return true;
  if (!m || m.length < 3) return true;
  if (/^(zl|to|from|paid|na|n\/a|unknown)$/i.test(m)) return true;
  if ((item.confidence ?? 0) < minConf) return true;
  if (item.status === "failed") return true;
  if (rejectPending && item.status === "pending") return true;
  return false;
}

/** Strict filter for unattended bulk / live import (no review UI). */
export function isJunkForAutoImport(item: ParsedExpense): boolean {
  return isJunk(item, {
    minConfidence: MIN_AUTO_IMPORT_CONFIDENCE,
    rejectPending: true,
  });
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
