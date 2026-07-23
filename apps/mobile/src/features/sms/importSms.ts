import {
  classifySmsMessages,
  type ClassifiedSmsRow,
  type ClassifySmsResult,
  type ClassifySmsStats,
  isPaymentSms,
  type ParsedExpense,
  parseSmsMessages,
  type SmsMessageInput,
  type SmsSkipReason,
  smsReasonLabel,
} from "@paymenttracker/shared";
import { applyPaymentToAccount } from "@/src/data/cash";
import { saveExpenseChunks } from "@/src/data/expenseChunks";
import {
  backfillMissingCategories,
  createExpensesBatch,
} from "@/src/data/expenses";
import { resolveCategoryId } from "./categorize";
import { dayKey, resolveMerchant, safePaidAtIso } from "./quality";
import { type ListInboxOptions, listInboxSms } from "./readInbox";

export type ImportSmsResult = {
  parsed: ParsedExpense[];
  scanned: number;
  paymentLike: number;
};

export type BulkImportSmsResult = {
  created: number;
  skipped: number;
  failed: number;
  scanned: number;
  paymentLike: number;
  /** Total parses returned by the SMS parser (pre-filter). */
  parsed: number;
  /** Count dropped by quality filter (junk / pending / low confidence). */
  junked: number;
  /** Unique good rows after client dedupe (attempted for save). */
  considered: number;
  /** True if a mid-batch chunk threw after earlier chunks saved. */
  partial: boolean;
};

export type ScanSmsInboxResult = ClassifySmsResult & {
  messages: SmsMessageInput[];
};

export { smsReasonLabel };
export type { ClassifiedSmsRow, ClassifySmsStats, SmsSkipReason };

/**
 * Read the Android SMS inbox on-device and parse payment-like messages.
 * Nothing is uploaded — only structured expenses are returned.
 */
export async function importPaymentsFromSms(
  options: ListInboxOptions = {},
): Promise<ImportSmsResult> {
  const messages: SmsMessageInput[] = await listInboxSms(options);
  const paymentLike = messages.filter((m) =>
    isPaymentSms(m.body, m.address),
  ).length;
  const parsed = parseSmsMessages(messages, {
    minConfidence: 0.35,
    filterNonPayment: true,
  });

  return {
    parsed,
    scanned: messages.length,
    paymentLike,
  };
}

/**
 * Full inbox scan with per-message classification for the SMS import UI.
 * Does not write expenses — only classifies what would import vs skip.
 */
export async function scanSmsInboxForImport(
  options: ListInboxOptions = {},
): Promise<ScanSmsInboxResult> {
  const messages = await listInboxSms({
    lookbackDays: options.lookbackDays ?? 90,
    maxCount: options.maxCount ?? 2000,
    minDateMs: options.minDateMs,
  });
  const classified = classifySmsMessages(messages);
  return { ...classified, messages };
}

async function toBatchPayload(rows: ParsedExpense[]) {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const merchant = resolveMerchant(r);
    const direction = r.direction ?? "debit";
    const categoryId = await resolveCategoryId(merchant, direction, r.rawText);
    out.push({
      merchant,
      amount: String(r.amount).replace(/,/g, ""),
      direction,
      paidAt: safePaidAtIso(r.paidAt),
      source:
        r.source === "phonepe" ||
        r.source === "gpay" ||
        r.source === "upi" ||
        r.source === "sms"
          ? r.source
          : ("sms" as const),
      upiRef: r.upiRef ?? null,
      notes: null,
      rawOcrText: r.rawText || null,
      categoryId,
    });
  }
  return out;
}

function newestWithBalance(rows: ParsedExpense[]): ParsedExpense | null {
  const withBal = rows
    .filter((r) => r.availableBalance)
    .sort((a, b) => {
      const ta = a.paidAt ? Date.parse(a.paidAt) : 0;
      const tb = b.paidAt ? Date.parse(b.paidAt) : 0;
      return tb - ta;
    });
  return withBal[0] ?? null;
}

/**
 * Save already-parsed expenses (from scan importable rows or forced skips).
 */
export async function saveParsedSmsExpenses(
  rows: ParsedExpense[],
  onProgress?: (status: string) => void,
): Promise<{
  created: number;
  skipped: number;
  failed: number;
  partial: boolean;
}> {
  if (!rows.length) {
    return { created: 0, skipped: 0, failed: 0, partial: false };
  }

  // Client-side day key dedupe (ref/soft already done by classifier)
  const keys = new Set<string>();
  const unique = rows.filter((r) => {
    if (r.upiRef) {
      const k = `upi:${r.upiRef.trim().toLowerCase()}`;
      if (keys.has(k)) return false;
      keys.add(k);
      return true;
    }
    const k = `${(r.merchant ?? "").trim().toLowerCase()}|${r.amount}|${dayKey(r.paidAt)}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });

  onProgress?.(
    unique.length === 1
      ? "Found 1 payment — importing…"
      : `Found ${unique.length} payments — importing…`,
  );
  onProgress?.("Categorizing payments…");
  const payload = await toBatchPayload(unique);

  const batchRes = await saveExpenseChunks(payload, createExpensesBatch, {
    onProgress,
    yieldBetween: true,
  });

  const balanceSource = newestWithBalance(rows);
  if (balanceSource?.availableBalance && balanceSource.amount) {
    try {
      await applyPaymentToAccount({
        amount: balanceSource.amount,
        direction: balanceSource.direction ?? "debit",
        paidAt: balanceSource.paidAt,
        availableBalance: balanceSource.availableBalance,
      });
    } catch {
      /* best-effort */
    }
  }

  try {
    onProgress?.("Updating categories…");
    await backfillMissingCategories();
  } catch {
    /* best-effort */
  }

  if (batchRes.error && batchRes.created === 0 && batchRes.skipped === 0) {
    throw batchRes.error;
  }

  return {
    created: batchRes.created,
    skipped: batchRes.skipped,
    failed: batchRes.failed,
    partial: batchRes.partial || Boolean(batchRes.error),
  };
}

/**
 * Scan inbox, keep confident payments, save them all, sync newest bank balance.
 * Progress strings are for button/status UI.
 */
export async function importAndSavePaymentsFromSms(
  options: ListInboxOptions = {},
  onProgress?: (status: string) => void,
): Promise<BulkImportSmsResult> {
  onProgress?.("Scanning messages…");
  const scan = await scanSmsInboxForImport({
    lookbackDays: options.lookbackDays ?? 90,
    maxCount: options.maxCount ?? 2000,
    minDateMs: options.minDateMs,
  });

  const { stats } = scan;
  const importableParsed = scan.importable
    .map((r) => r.parsed)
    .filter((p): p is ParsedExpense => Boolean(p && p.amount));

  // Also include any payment-like parses that pass junk filter but classifier
  // might have edge-case differences — stick to importable list only.
  const empty = (): BulkImportSmsResult => ({
    created: 0,
    skipped: 0,
    failed: 0,
    scanned: stats.scanned,
    paymentLike: stats.paymentLike,
    parsed: stats.paymentLike,
    junked: stats.skipped,
    considered: 0,
    partial: false,
  });

  if (!importableParsed.length) {
    try {
      onProgress?.("Updating categories…");
      await backfillMissingCategories();
    } catch {
      /* best-effort */
    }
    // Still try balance from any parsed payment-like row with Avl Bal
    const anyWithBal = scan.rows
      .map((r) => r.parsed)
      .filter((p): p is ParsedExpense => Boolean(p?.availableBalance));
    const bal = newestWithBalance(anyWithBal);
    if (bal?.availableBalance && bal.amount) {
      try {
        await applyPaymentToAccount({
          amount: bal.amount,
          direction: bal.direction ?? "debit",
          paidAt: bal.paidAt,
          availableBalance: bal.availableBalance,
        });
      } catch {
        /* best-effort */
      }
    }
    return empty();
  }

  const junked = stats.skipped;
  const saveRes = await saveParsedSmsExpenses(importableParsed, onProgress);

  return {
    created: saveRes.created,
    skipped: saveRes.skipped,
    failed: saveRes.failed,
    scanned: stats.scanned,
    paymentLike: stats.paymentLike,
    parsed: stats.paymentLike,
    junked,
    considered: importableParsed.length,
    partial: saveRes.partial,
  };
}

/**
 * Force-save selected classified rows (including ones the quality gate skipped),
 * as long as they have a parseable amount.
 */
export async function forceImportClassifiedRows(
  rows: ClassifiedSmsRow[],
  onProgress?: (status: string) => void,
): Promise<{ created: number; skipped: number; failed: number }> {
  // Force path: user explicitly selected rows — only require amount + not failed
  const usable = rows
    .map((r) => r.parsed)
    .filter((p): p is ParsedExpense => {
      if (!p?.amount) return false;
      if (p.status === "failed") return false;
      return true;
    });

  const res = await saveParsedSmsExpenses(usable, onProgress);
  return {
    created: res.created,
    skipped: res.skipped,
    failed: res.failed,
  };
}
