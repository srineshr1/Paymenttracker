import {
  isPaymentSms,
  parseSmsMessage,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { isUnlocked, LocalDataError } from "@/src/data/crypto";
import { createExpense } from "@/src/data/expenses";
import {
  drainPendingSms,
  isSmsInboxAvailable,
  listInboxSms,
  startSmsListening,
  stopSmsListening,
  subscribeSmsReceived,
} from "./readInbox";
import {
  getSmsAutoImportEnabled,
  setSmsAutoImportEnabled,
} from "./prefs";

export type AutoImportResult =
  | { status: "saved"; merchant: string; amount: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

type Listener = (result: AutoImportResult) => void;

const MIN_CONFIDENCE = 0.55;
/** Catch-up window when app returns to foreground (ms). */
const CATCHUP_MS = 15 * 60 * 1000;

let running = false;
let unsubNative: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;
let processing = false;
const queue: Array<SmsMessageInput & { id?: string | null }> = [];
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
 */
export async function processIncomingSms(
  msg: SmsMessageInput & { id?: string | null }
): Promise<AutoImportResult> {
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

  if (parsed.status === "failed") {
    return { status: "skipped", reason: "failed_tx" };
  }
  if ((parsed.confidence ?? 0) < MIN_CONFIDENCE) {
    return { status: "skipped", reason: "low_confidence" };
  }
  if (!parsed.amount || !(parsed.merchant ?? "").trim()) {
    return { status: "skipped", reason: "incomplete" };
  }

  const source =
    parsed.source === "phonepe" ||
    parsed.source === "gpay" ||
    parsed.source === "sms"
      ? parsed.source
      : "sms";

  try {
    await createExpense({
      merchant: (parsed.merchant ?? "").trim(),
      amount: String(parsed.amount).replace(/,/g, ""),
      direction: parsed.direction ?? "debit",
      paidAt: parsed.paidAt
        ? new Date(parsed.paidAt).toISOString()
        : new Date(msg.dateMs ?? Date.now()).toISOString(),
      source,
      upiRef: parsed.upiRef ?? null,
      notes: null,
      rawOcrText: body.slice(0, 20000),
    });
    const result: AutoImportResult = {
      status: "saved",
      merchant: (parsed.merchant ?? "").trim(),
      amount: String(parsed.amount),
    };
    emit(result);
    return result;
  } catch (e) {
    if (e instanceof LocalDataError && e.status === 409) {
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
      await processIncomingSms(next);
    }
  } finally {
    processing = false;
  }
}

function enqueue(msg: SmsMessageInput & { id?: string | null }) {
  queue.push(msg);
  void flushQueue();
}

async function catchUpRecent() {
  if (!isUnlocked()) return;
  const now = Date.now();
  if (now - lastCatchupAt < 8_000) return;
  lastCatchupAt = now;
  try {
    const pending = await drainPendingSms();
    for (const m of pending) enqueue(m);

    const recent = await listInboxSms({
      minDateMs: now - CATCHUP_MS,
      maxCount: 40,
    });
    // oldest first so order is natural
    for (const m of [...recent].reverse()) {
      enqueue(m);
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

  appStateSub = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active") {
        void catchUpRecent();
        void flushQueue();
      }
    }
  );

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

/** Enable preference and start listening (requests SMS permissions). */
export async function enableSmsAutoImport(): Promise<void> {
  await setSmsAutoImportEnabled(true);
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
