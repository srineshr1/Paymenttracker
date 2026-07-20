import {
  cleanMerchantName,
  extractAmount,
  extractDirection,
  extractPaidAt,
  extractStatus,
  extractUpiRef,
  normalizeOcrText,
  parseAmountToken,
  scoreConfidence,
} from "./shared.js";
import type {
  ParsedExpense,
  ParsedSource,
  SmsMessageInput,
} from "./types.js";

/** Amount-like token in SMS bodies (with or without ₹/Rs). */
const AMOUNT_TOKEN_RE =
  /(?:₹|rs\.?\s*|inr\s*)\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|(?:₹|rs\.?\s*|inr\s*)\s*[0-9]+(?:\.[0-9]{1,2})?/i;

/** Keywords that strongly suggest a payment / bank alert SMS. */
const PAYMENT_VERB_RE =
  /\b(?:debited|credited|withdrawn|spent|paid\s+to|sent\s+to|received\s+from|you\s+paid|upi|imps|neft|rtgs|a\/c|acct|account\s+(?:xx|x+\d|\*)|vpa)\b/i;

const OTP_RE =
  /\b(?:otp|one[\s-]?time\s+password|verification\s+code|do\s+not\s+share)\b/i;

/** Sender patterns common for Indian banks / UPI apps (DLT headers). */
const BANKISH_ADDRESS_RE =
  /(?:hdfc|sbi|icici|axis|kotak|yesb|pnb|bob|canara|union|idbi|indus|rbl|federal|ubi|iob|cbi|phonepe|gpay|google|paytm|bhim|slice|cred|amazon|flipkart|airtel|jio)/i;

/**
 * Cheap filter: is this SMS worth running the payment parser on?
 * Prefers body signals; address is a soft boost for bank short codes.
 */
export function isPaymentSms(
  body: string,
  address?: string | null
): boolean {
  const text = (body ?? "").trim();
  if (text.length < 12 || text.length > 2000) return false;
  // OTP / auth codes are never expenses
  if (OTP_RE.test(text) && !PAYMENT_VERB_RE.test(text)) return false;
  if (AMOUNT_TOKEN_RE.test(text) && PAYMENT_VERB_RE.test(text)) return true;
  if (AMOUNT_TOKEN_RE.test(text) && /\b(?:upi|vpa|ref)\b/i.test(text)) {
    return true;
  }
  if (
    address &&
    BANKISH_ADDRESS_RE.test(address) &&
    AMOUNT_TOKEN_RE.test(text) &&
    PAYMENT_VERB_RE.test(text)
  ) {
    return true;
  }
  return false;
}

function detectSmsSource(
  text: string,
  address?: string | null
): ParsedSource {
  const t = text.toLowerCase();
  const a = (address ?? "").toLowerCase();
  if (
    t.includes("phonepe") ||
    a.includes("phonepe") ||
    a.includes("phnpe")
  ) {
    return "phonepe";
  }
  if (
    t.includes("google pay") ||
    t.includes("gpay") ||
    /\bg\s*pay\b/.test(t) ||
    a.includes("gpay") ||
    a.includes("goog")
  ) {
    return "gpay";
  }
  return "sms";
}

/** Amount capture group: comma-grouped or plain digits with optional decimals. */
const AMT =
  "([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)";

/**
 * Extract post-transaction available balance from Indian bank / UPI SMS.
 * Examples: "Avl Bal Rs 10,000.00", "Available Balance: INR 5,432.10"
 */
export function extractAvailableBalance(text: string): string | null {
  const patterns = [
    new RegExp(
      `(?:avl\\.?\\s*bal(?:ance)?|available\\s*bal(?:ance)?|avail\\.?\\s*bal(?:ance)?|a\\/c\\s*bal(?:ance)?|acct?\\.?\\s*bal(?:ance)?|cleared\\s*bal(?:ance)?|total\\s*avail(?:able)?\\.?\\s*bal(?:ance)?)\\s*[:\\-]?\\s*(?:is\\s*)?(?:₹|rs\\.?|inr)?\\s*${AMT}`,
      "i"
    ),
    // "Bal Rs.1,234.56" near end of message (common bank footer)
    new RegExp(
      `(?:^|[.\\s])bal(?:ance)?\\s*[:\\-]?\\s*(?:₹|rs\\.?|inr)\\s*${AMT}\\s*$`,
      "i"
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

/** Prefer explicit SMS amount patterns (avoid OTP / balance false positives). */
function extractSmsAmount(text: string): string | null {
  const patterns = [
    new RegExp(`(?:₹|rs\\.?|inr)\\s*${AMT}`, "i"),
    new RegExp(
      `(?:debited|credited|spent|paid|sent|received|withdrawn)(?:\\s+(?:for|with|of|by))?\\s*(?:₹|rs\\.?|inr)?\\s*${AMT}`,
      "i"
    ),
    new RegExp(
      `(?:amount|amt)\\s*(?:of\\s*)?(?:₹|rs\\.?|inr)?\\s*${AMT}`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const parsed = parseAmountToken(m[1]);
      if (parsed) return parsed;
    }
  }
  return extractAmount(text);
}

function extractSmsMerchant(text: string): string | null {
  const patterns: RegExp[] = [
    // to VPA merchant@ybl / UPI-merchant@okaxis
    /(?:to|towards)\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9._\-]{1,40}@[A-Za-z0-9.\-]{2,30})/i,
    /(?:upi[\s\-:]+)([A-Za-z0-9][A-Za-z0-9._\-]{1,40}@[A-Za-z0-9.\-]{2,30})/i,
    // Paid Rs.450 to Swiggy / You paid ₹99 to Ravi
    /(?:paid|sent)\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+via|\s*$)/i,
    // paid/sent to Merchant Name
    /(?:paid\s+to|sent\s+to|payment\s+to|transfer\s+to)\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s+via|\s*$)/i,
    // you paid … to Merchant
    /you\s+paid\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+to\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s*$)/i,
    // received from
    /(?:received\s+from|credited\s+from|from\s+vpa)\s+([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,60}?)(?:\s*[.;,]|\s+upi|\s+ref|\s+on\b|\s*$)/i,
    // credited to X / Info: MERCHANT
    /(?:credited\s+to|info[:\s]+)([A-Za-z0-9][A-Za-z0-9 .&'@\-]{1,50}?)(?:\s*[.;,]|\s+upi|\s+ref|\s*$)/i,
    // UPI/MerchantName/ref style (SBI etc.)
    /upi\/([A-Za-z][A-Za-z0-9 .&'\-]{1,40}?)(?:\/|\s)/i,
    // at MERCHANT
    /\bat\s+([A-Za-z][A-Za-z0-9 .&'@\-]{2,40}?)(?:\s*[.;,]|\s+on\b|\s+upi|\s+ref|\s*$)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const raw = m[1].trim();
    // VPA → readable local-part
    if (raw.includes("@")) {
      const local = raw.split("@")[0] ?? raw;
      const name = cleanMerchantName(
        local.replace(/[._\-]+/g, " ").replace(/\d{4,}/g, "").trim()
      );
      if (name && name.length >= 2) return name;
      // Fall back to full VPA if local part is junk
      return raw.slice(0, 80);
    }
    const name = cleanMerchantName(raw);
    if (name) return name;
  }
  return null;
}

function extractSmsUpiRef(text: string): string | null {
  const patterns = [
    /(?:upi\s*(?:ref(?:erence)?(?:\s*no\.?)?|txn(?:\s*id)?|transaction\s*id)|utr|ref(?:erence)?\s*(?:no\.?|num(?:ber)?)?)\s*[:\-]?\s*([A-Z0-9]{8,40})/i,
    /\b([0-9]{12})\b/,
    /\b(T\d{10,}[A-Z0-9]*)\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return extractUpiRef(text);
}

/** Indian bank SMS dates: 17-07-26, 17/07/2026, 17Jul26, 17-Jul-26 */
function extractSmsPaidAt(
  text: string,
  fallbackMs?: number | null
): string | null {
  const fromText = extractPaidAt(text);
  if (fromText) return fromText;

  const reShort =
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i;
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

  // 17Jul26 / 17-Jul-2026
  const reMon =
    /(\d{1,2})[-\s]?([A-Za-z]{3,9})[-\s]?(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/i;
  const m2 = text.match(reMon);
  if (m2) {
    const months: Record<string, number> = {
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
    const day = Number(m2[1]);
    const month = months[m2[2].slice(0, 3).toLowerCase()];
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

/**
 * Parse a single payment SMS into a ParsedExpense.
 * Always returns a result (may have low confidence + warnings).
 */
export function parseSmsMessage(input: SmsMessageInput): ParsedExpense {
  const rawText = normalizeOcrText(input.body ?? "");
  const warnings: string[] = [];
  const source = detectSmsSource(rawText, input.address);

  const amount = extractSmsAmount(rawText);
  const merchant = extractSmsMerchant(rawText);
  const paidAt = extractSmsPaidAt(rawText, input.dateMs ?? null);
  const upiRef = extractSmsUpiRef(rawText);
  const direction = extractDirection(rawText);
  const status = extractStatus(rawText);
  const availableBalance = extractAvailableBalance(rawText);

  if (!amount) warnings.push("Could not detect amount");
  if (!merchant) warnings.push("Could not detect merchant");
  if (!paidAt) warnings.push("Could not detect date");
  if (status === "failed") warnings.push("Transaction appears failed");
  if (status === "pending") warnings.push("Transaction appears pending");

  // SMS without clear payment verbs is weaker
  const looksPayment =
    AMOUNT_TOKEN_RE.test(rawText) &&
    (PAYMENT_VERB_RE.test(rawText) || Boolean(upiRef));
  if (!looksPayment) {
    warnings.push("Message may not be a payment alert");
  }

  let confidence = scoreConfidence({
    amount,
    merchant,
    paidAt,
    upiRef,
    status,
    source,
  });
  // Slight boost for structured SMS with amount + merchant
  if (amount && merchant && looksPayment) {
    confidence = Math.min(1, confidence + 0.05);
  }
  if (!looksPayment) {
    confidence = Math.min(confidence, 0.4);
  }

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
    rawText,
    warnings,
    availableBalance,
  };
}

export type ParseSmsOptions = {
  /** Drop results below this confidence (default 0.35) */
  minConfidence?: number;
  /** Only keep messages that pass isPaymentSms (default true) */
  filterNonPayment?: boolean;
};

/**
 * Filter + parse many SMS rows. Skips non-payment bodies by default.
 * Sorted newest first when dateMs is present.
 */
export function parseSmsMessages(
  messages: SmsMessageInput[],
  options: ParseSmsOptions = {}
): ParsedExpense[] {
  const minConfidence = options.minConfidence ?? 0.35;
  const filterNonPayment = options.filterNonPayment !== false;

  const sorted = [...messages].sort(
    (a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0)
  );

  const out: ParsedExpense[] = [];
  const seen = new Set<string>();

  for (const msg of sorted) {
    if (filterNonPayment && !isPaymentSms(msg.body, msg.address)) continue;
    const parsed = parseSmsMessage(msg);
    if ((parsed.confidence ?? 0) < minConfidence) continue;
    if (!parsed.amount) continue;

    // Dedupe within this batch: upi ref or merchant|amount|day
    const day = parsed.paidAt
      ? parsed.paidAt.slice(0, 10)
      : "unknown";
    const key = parsed.upiRef
      ? `upi:${parsed.upiRef}`
      : `${(parsed.merchant ?? "").toLowerCase()}|${parsed.amount}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(parsed);
  }

  return out;
}
