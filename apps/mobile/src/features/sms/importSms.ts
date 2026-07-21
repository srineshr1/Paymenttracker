import {
  isPaymentSms,
  type ParsedExpense,
  parseSmsMessages,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { applyPaymentToAccount } from "@/src/data/cash";
import { saveExpenseChunks } from "@/src/data/expenseChunks";
import {
  backfillMissingCategories,
  createExpensesBatch,
} from "@/src/data/expenses";
import { resolveCategoryId } from "./categorize";
import {
  dayKey,
  isJunkForAutoImport,
  resolveMerchant,
  safePaidAtIso,
} from "./quality";
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
 * Scan inbox, keep confident payments, save them all, sync newest bank balance.
 * Progress strings are for button/status UI.
 */
export async function importAndSavePaymentsFromSms(
  options: ListInboxOptions = {},
  onProgress?: (status: string) => void,
): Promise<BulkImportSmsResult> {
  onProgress?.("Scanning messages…");
  const { parsed, scanned, paymentLike } = await importPaymentsFromSms({
    lookbackDays: options.lookbackDays ?? 90,
    maxCount: options.maxCount ?? 2000,
    minDateMs: options.minDateMs,
  });

  const empty = (): BulkImportSmsResult => ({
    created: 0,
    skipped: 0,
    failed: 0,
    scanned,
    paymentLike,
    parsed: parsed.length,
    junked: 0,
    considered: 0,
    partial: false,
  });

  if (!parsed.length) {
    try {
      onProgress?.("Updating categories…");
      await backfillMissingCategories();
    } catch {
      /* best-effort */
    }
    return empty();
  }

  // Balance from all payment parses (including junk), matching live auto-import
  const balanceSource = newestWithBalance(parsed);

  const good = parsed.filter((p) => !isJunkForAutoImport(p));
  const junked = parsed.length - good.length;

  // Client-side dedupe (merchant|amount|day) before hitting the DB
  const keys = new Set<string>();
  const unique = good.filter((r) => {
    const k = `${(r.merchant ?? "").trim().toLowerCase()}|${r.amount}|${dayKey(r.paidAt)}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let partial = false;

  if (unique.length) {
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
    created = batchRes.created;
    skipped = batchRes.skipped;
    failed = batchRes.failed;
    partial = batchRes.partial;

    if (batchRes.error) {
      // Still try balance + category backfill, then surface partial to caller
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
      // Re-throw only when nothing was saved; otherwise return partial totals
      if (!partial && created === 0 && skipped === 0 && failed === 0) {
        throw batchRes.error;
      }
      return {
        created,
        skipped,
        failed,
        scanned,
        paymentLike,
        parsed: parsed.length,
        junked,
        considered: unique.length,
        partial: true,
      };
    }
  }

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

  return {
    created,
    skipped,
    failed,
    scanned,
    paymentLike,
    parsed: parsed.length,
    junked,
    considered: unique.length,
    partial,
  };
}
