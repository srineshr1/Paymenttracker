import {
  isPaymentSms,
  parseSmsMessage,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { applyPaymentToAccount } from "@/src/data/cash";
import { isUnlocked, LocalDataError } from "@/src/data/crypto";
import { createExpense } from "@/src/data/expenses";
import { notifyPaymentCategoryConfirm } from "@/src/features/notifications/paymentConfirm";
import { resolveCategoryId } from "./categorize";
import { getSmsAutoImportEnabled, setSmsAutoImportEnabled } from "./prefs";
import { isJunkForAutoImport, resolveMerchant } from "./quality";
import {
  drainPendingSms,
  isSmsInboxAvailable,
  listInboxSms,
  startSmsListening,
  stopSmsListening,
  subscribeSmsReceived,
} from "./readInbox";

export type AutoImportResult =
  | {
      status: "saved";
      merchant: string;
      amount: string;
      expenseId: string;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

/** How the SMS entered the pipeline — live events get a category-confirm notification. */
export type AutoImportSource = "live" | "catchup";

type QueuedSms = SmsMessageInput & {
  id?: string | null;
  _source?: AutoImportSource;
};

type Listener = (result: AutoImportResult) => void;
/** Catch-up window when app returns to foreground (ms). */
const CATCHUP_MS = 15 * 60 * 1000;

let running = false;
let unsubNative: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;
let processing = false;
const queue: QueuedSms[] = [];
const recentKeys = new Set<string>();
const listeners = new Set<Listener>();
let lastCatchupAt = 0;

function emit(result: AutoImportResult) {
  for (const l of listeners) {
    try {
      l(result);
    } catch {
      /* ignore */
    }
  }
}

function msgKey(msg: SmsMessageInput & { id?: string | null }): string {
  if (msg.id) return `id:${msg.id}`;
  return `b:${msg.dateMs ?? 0}:${(msg.address ?? "").slice(0, 24)}:${(msg.body ?? "").slice(0, 80)}`;
}

function rememberKey(key: string) {
  recentKeys.add(key);
  if (recentKeys.size > 200) {
    const first = recentKeys.values().next().value;
    if (first != null) recentKeys.delete(first);
  }
}

/**
 * Parse one SMS and auto-save if it looks like a confident payment.
 * Only works while the app is unlocked (encrypted local DB).
 *
 * Live messages (new SMS / drained pending) show a category-confirm notification.
 * Catch-up scans of the inbox stay quiet to avoid spam.
 */
export async function processIncomingSms(
  msg: SmsMessageInput & { id?: string | null },
  opts?: { source?: AutoImportSource },
): Promise<AutoImportResult> {
  const sourceKind: AutoImportSource = opts?.source ?? "live";
  if (Platform.OS !== "android") {
    return { status: "skipped", reason: "not_android" };
  }
  if (!isUnlocked()) {
    return { status: "skipped", reason: "locked" };
  }

  const body = (msg.body ?? "").trim();
  if (!body) return { status: "skipped", reason: "empty" };

  const key = msgKey(msg);
  if (recentKeys.has(key)) {
    return { status: "skipped", reason: "duplicate_event" };
  }
  rememberKey(key);

  if (!isPaymentSms(body, msg.address)) {
    return { status: "skipped", reason: "not_payment" };
  }

  const parsed = parseSmsMessage({
    body,
    address: msg.address,
    dateMs: msg.dateMs,
  });

  const paidAtIso = parsed.paidAt
    ? new Date(parsed.paidAt).toISOString()
    : new Date(msg.dateMs ?? Date.now()).toISOString();

  // Always try bank "Avl Bal" → account balance (even if we skip the expense)
  const syncBalance = async () => {
    if (!parsed.availableBalance) return;
    try {
      await applyPaymentToAccount({
        amount: parsed.amount,
        direction: parsed.direction ?? "debit",
        paidAt: paidAtIso,
        availableBalance: parsed.availableBalance,
      });
    } catch {
      /* balance sync is best-effort */
    }
  };

  if (parsed.status === "failed") {
    await syncBalance();
    return { status: "skipped", reason: "failed_tx" };
  }
  if (parsed.status === "pending") {
    await syncBalance();
    return { status: "skipped", reason: "pending_tx" };
  }
  if (isJunkForAutoImport(parsed)) {
    await syncBalance();
    return { status: "skipped", reason: "low_quality" };
  }

  const source =
    parsed.source === "phonepe" ||
    parsed.source === "gpay" ||
    parsed.source === "upi" ||
    parsed.source === "sms"
      ? parsed.source
      : "sms";

  const merchant = resolveMerchant(parsed);
  const direction = parsed.direction ?? "debit";
  let categoryId: string | null = null;
  try {
    categoryId = await resolveCategoryId(merchant, direction, body);
  } catch {
    /* categories optional */
  }

  try {
    const { expense } = await createExpense({
      merchant,
      amount: String(parsed.amount).replace(/,/g, ""),
      direction,
      paidAt: paidAtIso,
      source,
      upiRef: parsed.upiRef ?? null,
      notes: null,
      rawOcrText: body.slice(0, 20000),
      categoryId,
    });
    await syncBalance();
    if (sourceKind === "live") {
      void notifyPaymentCategoryConfirm(expense);
    }
    const result: AutoImportResult = {
      status: "saved",
      merchant,
      amount: String(parsed.amount),
      expenseId: expense.id,
    };
    emit(result);
    return result;
  } catch (e) {
    if (e instanceof LocalDataError && e.status === 409) {
      await syncBalance();
      const result: AutoImportResult = {
        status: "skipped",
        reason: "already_saved",
      };
      emit(result);
      return result;
    }
    const result: AutoImportResult = {
      status: "error",
      reason: e instanceof Error ? e.message : "save_failed",
    };
    emit(result);
    return result;
  }
}

async function flushQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      if (!isUnlocked()) {
        queue.unshift(next);
        break;
      }
      const src = next._source ?? "live";
      const { _source: _, ...msg } = next;
      await processIncomingSms(msg, { source: src });
    }
  } finally {
    processing = false;
  }
}

function enqueue(
  msg: SmsMessageInput & { id?: string | null },
  source: AutoImportSource = "live",
) {
  queue.push({ ...msg, _source: source });
  void flushQueue();
}

async function catchUpRecent() {
  if (!isUnlocked()) return;
  const now = Date.now();
  if (now - lastCatchupAt < 8_000) return;
  lastCatchupAt = now;
  try {
    const pending = await drainPendingSms();
    // Messages held while the process was away still count as "live" payments.
    for (const m of pending) enqueue(m, "live");

    const recent = await listInboxSms({
      minDateMs: now - CATCHUP_MS,
      maxCount: 40,
    });
    // oldest first so order is natural — quiet scan, no notification spam
    for (const m of [...recent].reverse()) {
      enqueue(m, "catchup");
    }
  } catch {
    /* permission or native glitch */
  }
}

/**
 * Start autonomous SMS → expense pipeline.
 * Safe to call repeatedly. No-op off Android or without native module.
 */
export async function startSmsAutoImport(): Promise<void> {
  if (Platform.OS !== "android" || !isSmsInboxAvailable()) return;
  if (running) {
    void catchUpRecent();
    return;
  }

  const enabled = await getSmsAutoImportEnabled();
  if (!enabled) return;

  running = true;

  unsubNative = subscribeSmsReceived((msg) => {
    enqueue(msg);
  });

  try {
    await startSmsListening();
  } catch {
    // Listener failed (permission); still try catch-up if we can list
  }

  appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      void catchUpRecent();
      void flushQueue();
    }
  });

  void catchUpRecent();
}

export async function stopSmsAutoImport(): Promise<void> {
  running = false;
  unsubNative?.();
  unsubNative = null;
  appStateSub?.remove();
  appStateSub = null;
  queue.length = 0;
  await stopSmsListening();
}

/** Enable preference and start listening (requests SMS + notification permissions). */
export async function enableSmsAutoImport(): Promise<void> {
  if (Platform.OS !== "android" || !isSmsInboxAvailable()) {
    throw new Error(
      Platform.OS === "android"
        ? "SMS import needs the Spentd APK (not Expo Go). Install from GitHub Releases or run: npx expo run:android"
        : "SMS import is only available on Android.",
    );
  }
  await setSmsAutoImportEnabled(true);
  // Category-confirm banners after each live payment (best-effort).
  try {
    const { requestPaymentNotificationPermission } = await import(
      "@/src/features/notifications/paymentConfirm"
    );
    await requestPaymentNotificationPermission();
  } catch {
    /* notifications optional */
  }
  await startSmsAutoImport();
}

/** Disable preference and stop listening. */
export async function disableSmsAutoImport(): Promise<void> {
  await setSmsAutoImportEnabled(false);
  await stopSmsAutoImport();
}

export function isSmsAutoImportRunning(): boolean {
  return running;
}

export function subscribeAutoImportResults(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export { getSmsAutoImportEnabled, setSmsAutoImportEnabled };
