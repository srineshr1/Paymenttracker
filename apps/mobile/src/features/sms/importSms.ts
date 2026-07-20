import {
  isPaymentSms,
  parseSmsMessages,
  type ParsedExpense,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { applyPaymentToAccount } from "@/src/data/cash";
import { createExpensesBatch } from "@/src/data/expenses";
import { listInboxSms, type ListInboxOptions } from "./readInbox";
import { dayKey, isJunk } from "./quality";

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
  considered: number;
};

const CHUNK = 80;

/**
 * Read the Android SMS inbox on-device and parse payment-like messages.
 * Nothing is uploaded — only structured expenses are returned.
 */
export async function importPaymentsFromSms(
  options: ListInboxOptions = {}
): Promise<ImportSmsResult> {
  const messages: SmsMessageInput[] = await listInboxSms(options);
  const paymentLike = messages.filter((m) =>
    isPaymentSms(m.body, m.address)
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

function toBatchPayload(rows: ParsedExpense[]) {
  return rows.map((r) => ({
    merchant: (r.merchant ?? "").trim(),
    amount: String(r.amount).replace(/,/g, ""),
    direction: r.direction ?? "debit",
    paidAt: r.paidAt
      ? new Date(r.paidAt).toISOString()
      : new Date().toISOString(),
    source:
      r.source === "phonepe" || r.source === "gpay" || r.source === "sms"
        ? r.source
        : ("sms" as const),
    upiRef: r.upiRef ?? null,
    notes: null,
    rawOcrText: r.rawText || null,
  }));
}

/**
 * Scan inbox, keep confident payments, save them all, sync newest bank balance.
 * Progress strings are for button/status UI.
 */
export async function importAndSavePaymentsFromSms(
  options: ListInboxOptions = {},
  onProgress?: (status: string) => void
): Promise<BulkImportSmsResult> {
  onProgress?.("Scanning messages…");
  const { parsed, scanned, paymentLike } = await importPaymentsFromSms({
    lookbackDays: options.lookbackDays ?? 90,
    maxCount: options.maxCount ?? 2000,
    minDateMs: options.minDateMs,
  });

  if (!parsed.length) {
    return {
      created: 0,
      skipped: 0,
      failed: 0,
      scanned,
      paymentLike,
      considered: 0,
    };
  }

  const good = parsed.filter((p) => !isJunk(p));

  // Client-side dedupe (merchant|amount|day) before hitting the DB
  const keys = new Set<string>();
  const unique = good.filter((r) => {
    const k = `${(r.merchant ?? "").trim().toLowerCase()}|${r.amount}|${dayKey(r.paidAt)}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });

  if (!unique.length) {
    return {
      created: 0,
      skipped: 0,
      failed: 0,
      scanned,
      paymentLike,
      considered: 0,
    };
  }

  onProgress?.(
    unique.length === 1
      ? "Found 1 payment — importing…"
      : `Found ${unique.length} payments — importing…`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const payload = toBatchPayload(unique);

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    if (payload.length > CHUNK) {
      const from = i + 1;
      const to = Math.min(i + CHUNK, payload.length);
      onProgress?.(`Importing ${from}–${to} of ${payload.length}…`);
    }
    const res = await createExpensesBatch(chunk);
    created += res.created;
    skipped += res.skipped;
    failed += res.failed;
  }

  // Newest absolute bank balance from this batch (if any SMS include Avl Bal)
  const withBal = unique
    .filter((r) => r.availableBalance)
    .sort((a, b) => {
      const ta = a.paidAt ? Date.parse(a.paidAt) : 0;
      const tb = b.paidAt ? Date.parse(b.paidAt) : 0;
      return tb - ta;
    });
  if (withBal[0]?.availableBalance && withBal[0].amount) {
    try {
      await applyPaymentToAccount({
        amount: withBal[0].amount,
        direction: withBal[0].direction ?? "debit",
        paidAt: withBal[0].paidAt,
        availableBalance: withBal[0].availableBalance,
      });
    } catch {
      /* best-effort */
    }
  }

  return {
    created,
    skipped,
    failed,
    scanned,
    paymentLike,
    considered: unique.length,
  };
}
