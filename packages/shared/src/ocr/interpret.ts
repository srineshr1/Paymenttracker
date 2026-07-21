import {
  BALANCE_MARKERS,
  detectAppOrBank,
  isBankName,
  OTP_RE,
  PAYMENT_VERBS,
  PROMO_RE,
  RAIL_TOKENS,
  REFERENCE_MARKERS,
  verbAlternation,
} from "./lexicon.js";
import {
  cleanMerchantName,
  extractDirection,
  extractPaidAt,
  extractStatus,
  normalizeOcrText,
  parseAmountToken,
  scoreConfidence,
} from "./shared.js";
import type { ParsedDirection, ParsedExpense, ParsedSource } from "./types.js";

/**
 * Deterministic on-device "mini interpreter" for transaction text.
 *
 * Works on any bank / UPI / wallet message OR OCR text from any payment app.
 * Instead of a rigid first-match regex chain, it generates scored *candidates*
 * for each field (amount, merchant, date, …), penalises distractors
 * (balances, reference numbers, card masks, OTPs) and picks the best. This is
 * the shared brain used by both SMS parsing and screenshot parsing.
 *
 * Fully offline, no model download, no network — the app never uploads text.
 */

export type InterpretHints = {
  /** Caller-supplied source (e.g. brand detected from an OCR logo). */
  source?: ParsedSource;
  /** SMS sender id / short code, e.g. VM-HDFCBK. */
  address?: string | null;
  /** Epoch ms fallback when the body has no parseable date (SMS). */
  dateMs?: number | null;
  /** True for SMS bodies (affects source fallback + payment heuristics). */
  isSms?: boolean;
};

const PAYMENT_VERB_ALT = verbAlternation(PAYMENT_VERBS);
const RAIL_ALT = verbAlternation(RAIL_TOKENS);

/** Amount-with-optional-currency scanner. Group 1 = currency, group 2 = number. */
const AMOUNT_SCAN_RE =
  /(₹|rs\.?|inr|%|¥|₽)?\s*((?:[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)|(?:[0-9]+(?:\.[0-9]{1,2})?))/gi;

type AmountCandidate = {
  value: string;
  score: number;
  index: number;
};

/** Lowercase context window before a match (default 28 chars). */
function before(text: string, index: number, span = 28): string {
  return text.slice(Math.max(0, index - span), index).toLowerCase();
}

/** Lowercase context window after a match end (default 20 chars). */
function after(text: string, end: number, span = 20): string {
  return text.slice(end, end + span).toLowerCase();
}

function anyMarkerNear(ctx: string, markers: string[]): boolean {
  return markers.some((m) => ctx.includes(m));
}

/**
 * Score every amount-like token in the text and return the best transaction
 * amount. Prefers currency-marked numbers next to payment verbs; heavily
 * penalises balances, reference numbers, account/card masks and long ids.
 */
export function extractBestAmount(text: string): string | null {
  const candidates: AmountCandidate[] = [];

  for (const m of text.matchAll(AMOUNT_SCAN_RE)) {
    const currency = m[1];
    const numberToken = m[2];
    if (!numberToken) continue;
    const start = m.index ?? 0;
    const numStart = start + m[0].indexOf(numberToken);
    const end = numStart + numberToken.length;

    // Parse the numeric token only — the currency is captured separately, and
    // feeding "Rs." in would corrupt the value (".450.00" → NaN).
    const value = parseAmountToken(numberToken);
    if (!value) continue;

    const ctxBefore = before(text, numStart);
    const ctxAfter = after(text, end);
    const charBefore = text[numStart - 1] ?? "";
    const charAfter = text[end] ?? "";

    const hasCurrency = Boolean(currency);
    const isGrouped = /,/.test(numberToken); // 1,250 style → very likely money
    const hasDecimals = /\.[0-9]{1,2}$/.test(numberToken);
    const digitsOnly = numberToken.replace(/[.,]/g, "");
    const intLen = digitsOnly.replace(/\..*$/, "").length;

    let score = 0;
    if (hasCurrency) score += 2.2;
    if (isGrouped) score += 1.6;
    if (hasDecimals) score += 0.8;

    // Payment verb immediately around the amount → strong signal.
    if (PAYMENT_VERB_ALT.test(ctxBefore) || PAYMENT_VERB_ALT.test(ctxAfter)) {
      score += 2.4;
    }
    if (/\b(amount|amt|txn|of\s+rs|for\s+rs)\b/.test(ctxBefore)) score += 1.0;

    // Distractors ----------------------------------------------------------
    if (anyMarkerNear(ctxBefore, BALANCE_MARKERS)) score -= 4.0;
    if (/\bbal(?:ance)?\b/.test(ctxAfter)) score -= 2.0;
    if (
      anyMarkerNear(ctxBefore, REFERENCE_MARKERS) &&
      !hasCurrency &&
      !isGrouped
    ) {
      score -= 3.5;
    }
    // Glued to letters / @ / masks (T24071.., xx1234, a/cX1234, ref no.)
    if (/[a-z@*]/i.test(charBefore)) score -= 2.5;
    if (/[a-z@]/i.test(charAfter)) score -= 1.2;
    // OTP / verification codes are never amounts.
    if (
      /\b(?:otp|one[\s-]?time|verification|passcode|password|code)\b/.test(
        ctxBefore,
      )
    ) {
      score -= 4.0;
    }
    // Long bare integer with no money markers ⇒ almost surely a ref/id/phone.
    if (!hasCurrency && !isGrouped && !hasDecimals && intLen >= 7) score -= 4.0;
    if (!hasCurrency && !isGrouped && !hasDecimals && intLen === 6)
      score -= 1.6;
    if (!hasCurrency && !isGrouped && !hasDecimals && intLen === 5)
      score -= 0.5;
    // Percentages ("5% cashback") aren't amounts.
    if (charAfter === "%") score -= 2.5;
    // Year-like bare number near a date.
    if (!hasCurrency && /^(19|20)\d{2}$/.test(numberToken)) score -= 1.5;

    candidates.push({ value, score, index: numStart });
  }

  if (candidates.length === 0) return null;

  // Highest score wins; tie-break by earliest occurrence (txn amount usually
  // precedes the balance footer in bank SMS).
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = candidates[0];
  // If even the best candidate looks like noise, treat as "no amount".
  if (best.score <= -1.5) return null;
  return best.value;
}

/** Amount capture group shared by balance regexes. */
const AMT =
  "([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)";

/**
 * Post-transaction available balance (bank SMS footer).
 * e.g. "Avl Bal Rs 10,000.00", "Available Balance: INR 5,432.10"
 */
export function extractAvailableBalance(text: string): string | null {
  const patterns = [
    new RegExp(
      `(?:avl\\.?\\s*bal(?:ance)?|available\\s*bal(?:ance)?|avail\\.?\\s*bal(?:ance)?|a\\/c\\s*bal(?:ance)?|acct?\\.?\\s*bal(?:ance)?|cleared\\s*bal(?:ance)?|total\\s*avail(?:able)?\\.?\\s*bal(?:ance)?)\\s*[:\\-]?\\s*(?:is\\s*)?(?:₹|rs\\.?|inr)?\\s*${AMT}`,
      "i",
    ),
    new RegExp(
      `(?:^|[.\\s])bal(?:ance)?\\s*[:\\-]?\\s*(?:₹|rs\\.?|inr)\\s*${AMT}\\s*$`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const parsed = parseAmountToken(m[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

/** Reference / UTR / transaction id. */
export function extractRef(text: string): string | null {
  const patterns = [
    /(?:upi\s*(?:ref(?:erence)?(?:\s*no\.?)?|txn(?:\s*id)?|transaction\s*id)|utr|rrn|ref(?:erence)?\s*(?:no\.?|num(?:ber)?)?)\s*[:-]?\s*([A-Z0-9]{8,40})/i,
    /\b(T\d{10,}[A-Z0-9]*)\b/,
    /\b([0-9]{12})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

const MONTHS3: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Robust date extraction: reuses the shared long/relative formats, then adds
 * compact bank formats (17-07-26, 17/07/2026, 17Jul26) and finally the SMS
 * receipt timestamp.
 */
export function extractDateSmart(
  text: string,
  fallbackMs?: number | null,
): string | null {
  const fromText = extractPaidAt(text);
  if (fromText) return fromText;

  const reShort =
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i;
  const m = text.match(reShort);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    let hour = m[4] != null ? Number(m[4]) : 12;
    const minute = m[5] != null ? Number(m[5]) : 0;
    const ampm = m[7]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const d = new Date(year, month, day, hour, minute, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const reMon =
    /(\d{1,2})[-\s]?([A-Za-z]{3,9})[-\s]?(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/i;
  const m2 = text.match(reMon);
  if (m2) {
    const day = Number(m2[1]);
    const month = MONTHS3[m2[2].slice(0, 3).toLowerCase()];
    let year = Number(m2[3]);
    if (year < 100) year += 2000;
    const hour = m2[4] != null ? Number(m2[4]) : 12;
    const minute = m2[5] != null ? Number(m2[5]) : 0;
    if (month !== undefined) {
      const d = new Date(year, month, day, hour, minute, 0);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  if (fallbackMs != null && Number.isFinite(fallbackMs) && fallbackMs > 0) {
    return new Date(fallbackMs).toISOString();
  }
  return null;
}

type MerchantCandidate = { name: string; score: number };

const VPA_RE = /\b([A-Za-z0-9][A-Za-z0-9._-]{1,40}@[A-Za-z0-9.-]{2,30})\b/g;

/** Merchant phrases, each with a base score (higher = more trustworthy). */
const MERCHANT_PATTERNS: { re: RegExp; score: number; credit?: boolean }[] = [
  {
    re: /(?:paid\s+to|payment\s+to)\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+via|\s+vpa|\s+from\b|\n|\s*$)/i,
    score: 3.0,
  },
  {
    re: /(?:sent\s+to|transfer(?:red)?\s+to)\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+via|\s+vpa|\s+from\b|\n|\s*$)/i,
    score: 2.8,
  },
  {
    re: /you\s+paid\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+from\b|\n|\s*$)/i,
    score: 3.0,
  },
  {
    re: /(?:paid|sent)\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+via|\s+from\b|\n|\s*$)/i,
    score: 2.9,
  },
  {
    re: /(?:received\s+from|credited\s+from|from\s+vpa)\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\n|\s*$)/i,
    score: 2.7,
    credit: true,
  },
  {
    re: /(?:towards|to\s+vpa)\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+from\b|\n|\s*$)/i,
    score: 2.4,
  },
  {
    re: /\b(?:spent|purchase)\s+(?:of\s+)?(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:at|on)\s+([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,50}?)(?:\s*[.;,]|\s+on\b|\s+from\b|\n|\s*$)/i,
    score: 2.6,
  },
  {
    re: /\bat\s+([A-Za-z][A-Za-z0-9 .&'@()-]{2,40}?)(?:\s*[.;,]|\s+on\b|\s+upi|\s+ref|\s+from\b|\n|\s*$)/i,
    score: 1.6,
  },
  {
    re: /upi\/(?:[a-z]+\/)?([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)(?:\/|\s|$)/i,
    score: 1.8,
  },
  {
    re: /(?:info|remarks?|narration)\s*[:-]\s*([A-Za-z0-9][A-Za-z0-9 .&'@()-]{1,50}?)(?:\s*[.;,]|\n|\s*$)/i,
    score: 1.4,
  },
  // Generic "to X" — weak, only used if nothing better.
  {
    re: /\bto\s+([A-Za-z][A-Za-z0-9 .&'@()-]{2,50}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+from\b|\n|\s*$)/i,
    score: 0.9,
  },
];

function pushMerchant(
  out: MerchantCandidate[],
  raw: string | undefined,
  score: number,
): void {
  if (!raw) return;
  let candidate = raw.trim();

  // VPA → readable local part.
  if (candidate.includes("@")) {
    const local = candidate.split("@")[0] ?? candidate;
    const readable = local
      .replace(/[._-]+/g, " ")
      .replace(/\d{4,}/g, "")
      .trim();
    candidate = readable.length >= 2 ? readable : candidate;
  }

  const name = cleanMerchantName(candidate);
  if (!name) return;
  let s = score;
  if (isBankName(name)) s -= 2.5; // a bare bank name is not a merchant
  if (/\d{3,}/.test(name)) s -= 1.0; // digit-heavy → likely ref/account
  if (name.length <= 2) s -= 1.5;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(name)) s += 0.4; // Title Case name
  out.push({ name, score: s });
}

/**
 * Generate + score merchant candidates and return the best. `direction` biases
 * toward "from X" for credits and "to/at X" for debits.
 */
export function extractBestMerchant(
  text: string,
  direction: ParsedDirection,
): string | null {
  const out: MerchantCandidate[] = [];

  for (const vpa of text.matchAll(VPA_RE)) {
    pushMerchant(out, vpa[1], 2.5);
  }
  for (const { re, score, credit } of MERCHANT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const bias = credit
        ? direction === "credit"
          ? 0.6
          : -0.8
        : direction === "debit"
          ? 0.3
          : 0;
      pushMerchant(out, m[1], score + bias);
    }
  }

  if (out.length === 0) return null;
  out.sort((a, b) => b.score - a.score);
  // Require a minimally trustworthy candidate.
  if (out[0].score < 0.5) return null;
  return out[0].name;
}

/** Whether the text plausibly describes a real money movement. */
export function looksLikePayment(text: string, ref: string | null): boolean {
  if (PAYMENT_VERB_ALT.test(text)) return true;
  if (RAIL_ALT.test(text) && ref) return true;
  return false;
}

/**
 * Interpret any transaction text (SMS body or screenshot OCR) into a
 * ParsedExpense. Always returns a result — low confidence + warnings when the
 * text is ambiguous, so callers can decide via the quality gate.
 */
export function interpretTransactionText(
  raw: string,
  hints: InterpretHints = {},
): ParsedExpense {
  const text = normalizeOcrText(raw ?? "");
  const warnings: string[] = [];

  // For SMS, the *source* is the sender/header (e.g. "HDFC Bank:", "PhonePe:")
  // — never a merchant brand mentioned mid-body ("UPI/PhonePe Recharge",
  // "zomato@paytm"). For screenshots the brand appears as a title/logo, so use
  // the whole text.
  const detectionScope = hints.isSms
    ? `${hints.address ?? ""} ${text.split(/[:.\n]/)[0] ?? ""}`
    : text;
  const detected = detectAppOrBank(detectionScope, hints.address);
  let source: ParsedSource =
    hints.source && hints.source !== "unknown" ? hints.source : detected.source;
  if (source === "unknown" && hints.isSms) source = "sms";

  const amount = extractBestAmount(text);
  const direction = extractDirection(text);
  const merchant = extractBestMerchant(text, direction);
  const paidAt = extractDateSmart(text, hints.dateMs);
  const upiRef = extractRef(text);
  const status = extractStatus(text);
  const availableBalance = extractAvailableBalance(text);

  if (!amount) warnings.push("Could not detect amount");
  if (!merchant) warnings.push("Could not detect merchant");
  if (!paidAt) warnings.push("Could not detect date");
  if (status === "failed") warnings.push("Transaction appears failed");
  if (status === "pending") warnings.push("Transaction appears pending");

  const isPayment = looksLikePayment(text, upiRef);
  if (!isPayment) warnings.push("Message may not be a payment alert");

  let confidence = scoreConfidence({
    amount,
    merchant,
    paidAt,
    upiRef,
    status,
    source,
  });
  if (amount && merchant && isPayment)
    confidence = Math.min(1, confidence + 0.05);
  if (!isPayment) confidence = Math.min(confidence, 0.4);

  return {
    amount,
    currency: "INR",
    direction,
    merchant,
    paidAt,
    upiRef,
    source,
    status: status === "unknown" && amount ? "success" : status,
    confidence,
    rawText: text,
    warnings,
    availableBalance,
  };
}
