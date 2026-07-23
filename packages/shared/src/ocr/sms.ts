import { interpretTransactionText } from "./interpret.js";
import {
  detectAppOrBank,
  OTP_RE,
  PAYMENT_VERBS,
  PROMO_RE,
  RAIL_TOKENS,
  verbAlternation,
} from "./lexicon.js";
import {
  autoImportSkipReason,
  dayKey,
  isJunkForAutoImport,
} from "./quality.js";
import type { ParsedExpense, SmsMessageInput } from "./types.js";

/** Amount-like token in SMS bodies (with or without ₹/Rs). */
// Currency token, then an optional ":" and/or whitespace, then the number.
// Matches "Rs 25", "Rs.25", "Rs:25", "₹25", "INR: 25".
const CURRENCY_AMOUNT_SEP = String.raw`(?:₹|rs\.?|inr)\s*:?\s*`;
const AMOUNT_TOKEN_RE = new RegExp(
  `${CURRENCY_AMOUNT_SEP}[0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?` +
    `|${CURRENCY_AMOUNT_SEP}[0-9]+(?:\\.[0-9]{1,2})?`,
  "i",
);

const PAYMENT_VERB_ALT = verbAlternation(PAYMENT_VERBS);
const RAIL_ALT = verbAlternation(RAIL_TOKENS);
const REF_RE = /\b(?:ref(?:erence)?|utr|rrn|txn|transaction\s*id|upi\s*ref)\b/i;

/** Soft cross-source window: same amount + direction within this many ms → dup. */
const SOFT_DEDUP_MS = 5 * 60 * 1000;

/** Sender patterns common for Indian banks / UPI apps (DLT headers). */
const BANKISH_ADDRESS_RE =
  /(?:hdfc|sbi|icici|axis|kotak|yesb|pnb|bob|canara|union|idbi|indus|rbl|federal|idfc|ubi|iob|cbi|bank|phonepe|gpay|google|paytm|bhim|slice|cred|amazon|flipkart|airtel|jio|upi)/i;

/**
 * Cheap gate: is this SMS worth interpreting as a payment?
 *
 * App-agnostic — accepts any bank / UPI / wallet / card message that shows an
 * amount plus a real money-movement signal (verb, rail, ref, or a bank sender).
 * Rejects OTP / verification codes and pure promotional blasts.
 */
export function isPaymentSms(body: string, address?: string | null): boolean {
  const text = (body ?? "").trim();
  if (text.length < 12 || text.length > 2000) return false;

  const hasAmount = AMOUNT_TOKEN_RE.test(text);
  if (!hasAmount) return false;

  const hasVerb = PAYMENT_VERB_ALT.test(text);
  const hasRail = RAIL_ALT.test(text);
  const hasRef = REF_RE.test(text);
  const knownSource = detectAppOrBank(text, address).source !== "unknown";
  const bankishSender = Boolean(address && BANKISH_ADDRESS_RE.test(address));

  // OTP / verification code with no actual money movement → never an expense.
  if (OTP_RE.test(text) && !hasVerb) return false;

  // Marketing blast with no transaction signal → skip.
  if (PROMO_RE.test(text) && !hasVerb && !(hasRail && hasRef)) return false;

  // Real payment signals.
  if (hasVerb) return true;
  if (hasRail && (hasRef || knownSource)) return true;
  if (bankishSender && (hasRail || hasRef)) return true;

  return false;
}

/**
 * Parse a single payment SMS into a ParsedExpense via the shared interpreter.
 * Always returns a result (may be low confidence + warnings).
 */
export function parseSmsMessage(input: SmsMessageInput): ParsedExpense {
  return interpretTransactionText(input.body ?? "", {
    address: input.address,
    dateMs: input.dateMs ?? null,
    isSms: true,
  });
}

export type ParseSmsOptions = {
  /** Drop results below this confidence (default 0.35) */
  minConfidence?: number;
  /** Only keep messages that pass isPaymentSms (default true) */
  filterNonPayment?: boolean;
};

/** Prefer the richer parse when collapsing duplicates. */
function preferParsed(a: ParsedExpense, b: ParsedExpense): ParsedExpense {
  const score = (p: ParsedExpense) => {
    let s = p.confidence ?? 0;
    if (p.merchant) s += 0.15;
    if (p.availableBalance) s += 0.2;
    if (p.upiRef) s += 0.1;
    if (p.source === "sms") s += 0.05; // bank SMS often has Avl Bal
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

/**
 * Hard within-batch dedupe keys (exact match).
 * Soft cross-source twins (PhonePe + bank) are handled via
 * {@link isSoftDuplicatePayment}, not these keys.
 */
export function paymentDedupeKeys(parsed: ParsedExpense): string[] {
  const keys: string[] = [];
  if (parsed.upiRef) {
    keys.push(`upi:${parsed.upiRef.trim().toLowerCase()}`);
  }
  if (parsed.amount) {
    const day = dayKey(parsed.paidAt);
    const merch = (parsed.merchant ?? "").trim().toLowerCase();
    if (merch) keys.push(`day:${merch}|${parsed.amount}|${day}`);
  }
  return keys;
}

/** Same amount + direction within ±5 minutes (bank + UPI app twin SMS). */
export function isSoftDuplicatePayment(
  a: ParsedExpense,
  b: ParsedExpense,
): boolean {
  if (!a.amount || !b.amount || a.amount !== b.amount) return false;
  if ((a.direction ?? "debit") !== (b.direction ?? "debit")) return false;
  const ta = a.paidAt ? Date.parse(a.paidAt) : Number.NaN;
  const tb = b.paidAt ? Date.parse(b.paidAt) : Number.NaN;
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= SOFT_DEDUP_MS;
}

/**
 * Collapse duplicates in a parse batch (UPI ref, soft time window, day key).
 * Keeps the richer of each pair (balance / merchant / confidence).
 */
export function dedupeParsedExpenses(rows: ParsedExpense[]): {
  unique: ParsedExpense[];
  duplicates: ParsedExpense[];
} {
  const unique: ParsedExpense[] = [];
  const duplicates: ParsedExpense[] = [];
  const keyToIndex = new Map<string, number>();

  for (const row of rows) {
    const keys = paymentDedupeKeys(row);
    let hit: number | null = null;
    for (const k of keys) {
      const idx = keyToIndex.get(k);
      if (idx != null) {
        hit = idx;
        break;
      }
    }
    if (hit == null) {
      for (let i = 0; i < unique.length; i++) {
        if (isSoftDuplicatePayment(unique[i], row)) {
          hit = i;
          break;
        }
      }
    }
    if (hit != null) {
      const kept = unique[hit];
      const better = preferParsed(kept, row);
      unique[hit] = better;
      duplicates.push(better === kept ? row : kept);
      for (const k of paymentDedupeKeys(better)) {
        keyToIndex.set(k, hit);
      }
      continue;
    }
    const idx = unique.length;
    unique.push(row);
    for (const k of keys) keyToIndex.set(k, idx);
  }

  return { unique, duplicates };
}

/**
 * Filter + parse many SMS rows. Skips non-payment bodies by default.
 * Sorted newest first when dateMs is present, deduped within the batch.
 */
export function parseSmsMessages(
  messages: SmsMessageInput[],
  options: ParseSmsOptions = {},
): ParsedExpense[] {
  const minConfidence = options.minConfidence ?? 0.35;
  const filterNonPayment = options.filterNonPayment !== false;

  const sorted = [...messages].sort(
    (a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0),
  );

  const candidates: ParsedExpense[] = [];

  for (const msg of sorted) {
    if (filterNonPayment && !isPaymentSms(msg.body, msg.address)) continue;
    const parsed = parseSmsMessage(msg);
    if ((parsed.confidence ?? 0) < minConfidence) continue;
    if (!parsed.amount) continue;
    candidates.push(parsed);
  }

  return dedupeParsedExpenses(candidates).unique;
}

// ---------------------------------------------------------------------------
// Classification (importable vs skipped) — powers the "non-imported" UI
// ---------------------------------------------------------------------------

export type SmsSkipReason =
  | "not_payment"
  | "no_amount"
  | "failed_tx"
  | "pending_tx"
  | "low_confidence"
  | "junk"
  | "duplicate"
  | "already_saved";

export type SmsOutcome = "importable" | "skipped";

export type ClassifiedSmsRow = {
  id: string;
  message: SmsMessageInput;
  outcome: SmsOutcome;
  reason: SmsSkipReason | "importable";
  reasonLabel: string;
  parsed: ParsedExpense | null;
};

export type ClassifySmsStats = {
  scanned: number;
  paymentLike: number;
  importable: number;
  skipped: number;
  notPayment: number;
  byReason: Partial<Record<SmsSkipReason | "importable", number>>;
};

export type ClassifySmsResult = {
  rows: ClassifiedSmsRow[];
  stats: ClassifySmsStats;
  /** Rows that pass the auto-import gate (post-dedupe). */
  importable: ClassifiedSmsRow[];
  /** Payment-like rows that did not import (for UI list). */
  skippedPaymentLike: ClassifiedSmsRow[];
};

const REASON_LABELS: Record<SmsSkipReason | "importable", string> = {
  importable: "Ready to import",
  not_payment: "Not a payment",
  no_amount: "No amount found",
  failed_tx: "Failed transaction",
  pending_tx: "Pending / incomplete",
  low_confidence: "Low confidence parse",
  junk: "Incomplete / weak parse",
  duplicate: "Duplicate of another SMS",
  already_saved: "Already saved",
};

export function smsReasonLabel(reason: SmsSkipReason | "importable"): string {
  return REASON_LABELS[reason] ?? reason;
}

function rowId(msg: SmsMessageInput, index: number): string {
  const base = `${msg.dateMs ?? 0}:${(msg.address ?? "").slice(0, 24)}:${(msg.body ?? "").slice(0, 48)}`;
  return `${index}:${base}`;
}

/**
 * Prefer SMS receive time when the body has a date but no clock — so bank +
 * UPI-app twin messages land in the same soft-dedupe window.
 */
function withReceiveTime(
  parsed: ParsedExpense,
  msg: SmsMessageInput,
): ParsedExpense {
  if (msg.dateMs == null || !Number.isFinite(msg.dateMs) || msg.dateMs <= 0) {
    return parsed;
  }
  const bodyHasClock = /\d{1,2}:\d{2}/.test(msg.body ?? "");
  if (bodyHasClock) return parsed;
  return { ...parsed, paidAt: new Date(msg.dateMs).toISOString() };
}

/**
 * Classify every inbox row for the SMS import UI: importable vs skipped,
 * with human-readable reasons and counts.
 *
 * Non-payment SMS are included in `rows` (for full stats) but omitted from
 * `skippedPaymentLike` so the UI focuses on payment-like misses.
 */
export function classifySmsMessages(
  messages: SmsMessageInput[],
  options: { minParseConfidence?: number } = {},
): ClassifySmsResult {
  const minParse = options.minParseConfidence ?? 0.25;
  const sorted = [...messages].sort(
    (a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0),
  );

  type Draft = {
    id: string;
    message: SmsMessageInput;
    parsed: ParsedExpense | null;
    reason: SmsSkipReason | "importable";
  };

  const drafts: Draft[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    const id = rowId(msg, i);

    if (!isPaymentSms(msg.body, msg.address)) {
      drafts.push({
        id,
        message: msg,
        parsed: null,
        reason: "not_payment",
      });
      continue;
    }

    const parsed = withReceiveTime(parseSmsMessage(msg), msg);
    if ((parsed.confidence ?? 0) < minParse || !parsed.amount) {
      const skip = autoImportSkipReason(parsed) ?? "no_amount";
      drafts.push({
        id,
        message: msg,
        parsed,
        reason:
          skip === "low_confidence" || skip === "junk" ? skip : "no_amount",
      });
      continue;
    }

    const gate = autoImportSkipReason(parsed);
    if (gate) {
      drafts.push({ id, message: msg, parsed, reason: gate });
      continue;
    }

    drafts.push({ id, message: msg, parsed, reason: "importable" });
  }

  // Mark batch duplicates among importable (hard keys + soft time window)
  const keyToFirst = new Map<string, number>();
  const importableIdx: number[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (d.reason !== "importable" || !d.parsed) continue;

    let dupOf: number | null = null;
    for (const k of paymentDedupeKeys(d.parsed)) {
      const prev = keyToFirst.get(k);
      if (prev != null && prev !== i) {
        dupOf = prev;
        break;
      }
    }
    if (dupOf == null) {
      for (const j of importableIdx) {
        const other = drafts[j];
        if (
          other.reason === "importable" &&
          other.parsed &&
          isSoftDuplicatePayment(other.parsed, d.parsed)
        ) {
          dupOf = j;
          break;
        }
      }
    }

    if (dupOf != null) {
      const first = drafts[dupOf];
      if (first.parsed && d.parsed) {
        const better = preferParsed(first.parsed, d.parsed);
        if (better === d.parsed) {
          first.reason = "duplicate";
          d.reason = "importable";
          for (const k of paymentDedupeKeys(d.parsed)) {
            keyToFirst.set(k, i);
          }
          // Replace importableIdx entry
          const pos = importableIdx.indexOf(dupOf);
          if (pos >= 0) importableIdx[pos] = i;
        } else {
          d.reason = "duplicate";
        }
      } else {
        d.reason = "duplicate";
      }
      continue;
    }

    importableIdx.push(i);
    for (const k of paymentDedupeKeys(d.parsed)) keyToFirst.set(k, i);
  }

  const byReason: ClassifySmsStats["byReason"] = {};
  const rows: ClassifiedSmsRow[] = drafts.map((d) => {
    byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
    const outcome: SmsOutcome =
      d.reason === "importable" ? "importable" : "skipped";
    return {
      id: d.id,
      message: d.message,
      outcome,
      reason: d.reason,
      reasonLabel: smsReasonLabel(d.reason),
      parsed: d.parsed,
    };
  });

  const paymentLike = rows.filter((r) => r.reason !== "not_payment");
  const importable = rows.filter((r) => r.outcome === "importable");
  const skippedPaymentLike = paymentLike.filter((r) => r.outcome === "skipped");

  return {
    rows,
    stats: {
      scanned: rows.length,
      paymentLike: paymentLike.length,
      importable: importable.length,
      skipped: skippedPaymentLike.length,
      notPayment: byReason.not_payment ?? 0,
      byReason,
    },
    importable,
    skippedPaymentLike,
  };
}
