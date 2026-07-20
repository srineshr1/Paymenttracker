import type { ParsedExpense } from "@paymenttracker/shared";

/**
 * Whether a parsed payment is too weak / incomplete to auto-import.
 * Shared by SMS bulk import and the screenshot multi-select screen.
 */
export function isJunk(item: ParsedExpense): boolean {
  const m = (item.merchant ?? "").trim();
  if (!item.amount) return true;
  if (!m || m.length < 3) return true;
  if (/^(zl|to|from|paid|na|n\/a|unknown)$/i.test(m)) return true;
  if ((item.confidence ?? 0) < 0.45) return true;
  if (item.status === "failed") return true;
  return false;
}

export function dayKey(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "unknown";
  }
}
