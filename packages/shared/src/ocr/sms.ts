import { interpretTransactionText } from "./interpret.js";
import {
  detectAppOrBank,
  OTP_RE,
  PAYMENT_VERBS,
  PROMO_RE,
  RAIL_TOKENS,
  verbAlternation,
} from "./lexicon.js";
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

  const out: ParsedExpense[] = [];
  const seen = new Set<string>();

  for (const msg of sorted) {
    if (filterNonPayment && !isPaymentSms(msg.body, msg.address)) continue;
    const parsed = parseSmsMessage(msg);
    if ((parsed.confidence ?? 0) < minConfidence) continue;
    if (!parsed.amount) continue;

    // Dedupe within this batch: upi ref or merchant|amount|day
    const day = parsed.paidAt ? parsed.paidAt.slice(0, 10) : "unknown";
    const key = parsed.upiRef
      ? `upi:${parsed.upiRef}`
      : `${(parsed.merchant ?? "").toLowerCase()}|${parsed.amount}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(parsed);
  }

  return out;
}
