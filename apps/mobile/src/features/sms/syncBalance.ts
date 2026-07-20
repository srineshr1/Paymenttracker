import {
  extractAvailableBalance,
  isPaymentSms,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { Platform } from "react-native";
import {
  getWallets,
  setAccountBalanceFromSms,
  type WalletsState,
} from "@/src/data/cash";
import { isSmsInboxAvailable, listInboxSms } from "./readInbox";

/** How far back to scan for the newest available-balance SMS. */
const LOOKBACK_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 120;

/**
 * Scan recent inbox SMS for bank "Avl Bal" lines and set account balance
 * to the newest figure found. Mirrors the balance GPay/PhonePe show.
 */
export async function syncAccountBalanceFromInbox(): Promise<WalletsState> {
  if (Platform.OS !== "android" || !isSmsInboxAvailable()) {
    return getWallets();
  }

  let messages: SmsMessageInput[];
  try {
    messages = await listInboxSms({
      minDateMs: Date.now() - LOOKBACK_MS,
      maxCount: MAX_MESSAGES,
    });
  } catch {
    return getWallets();
  }

  let best: { balance: string; atMs: number } | null = null;

  for (const msg of messages) {
    const body = (msg.body ?? "").trim();
    if (!body) continue;
    // Prefer payment-like rows, but still try any bank-ish body with Avl Bal
    if (
      !isPaymentSms(body, msg.address) &&
      !/avl\.?\s*bal|available\s*bal/i.test(body)
    ) {
      continue;
    }
    const bal = extractAvailableBalance(body);
    if (!bal) continue;
    const atMs =
      msg.dateMs != null && Number.isFinite(msg.dateMs) && msg.dateMs > 0
        ? msg.dateMs
        : 0;
    if (!best || atMs >= best.atMs) {
      best = { balance: bal, atMs };
    }
  }

  if (!best) return getWallets();

  return setAccountBalanceFromSms(
    best.balance,
    best.atMs > 0 ? best.atMs : Date.now(),
  );
}
