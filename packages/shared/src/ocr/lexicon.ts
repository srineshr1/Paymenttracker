import type { ParsedSource } from "./types.js";

/**
 * App-agnostic lexicon for the transaction interpreter.
 *
 * The goal is to read *any* bank / UPI / wallet message or screenshot, so this
 * is intentionally broad and easy to extend — add a brand to APPS or a bank to
 * BANKS and the interpreter picks it up for detection + merchant filtering.
 * Nothing here is required for a message to parse; it only improves accuracy.
 */

/** Payment apps / wallets. `source` maps to a first-class ParsedSource logo. */
export const APPS: {
  key: string;
  display: string;
  source: ParsedSource;
  patterns: RegExp[];
}[] = [
  {
    key: "phonepe",
    display: "PhonePe",
    source: "phonepe",
    patterns: [/\bphone\s?pe\b/i, /\bphonepe\b/i, /\bphnpe\b/i],
  },
  {
    key: "gpay",
    display: "Google Pay",
    source: "gpay",
    patterns: [/\bgoogle\s*pay\b/i, /\bg[\s-]?pay\b/i, /\bgpay\b/i],
  },
  {
    key: "paytm",
    display: "Paytm",
    source: "upi",
    patterns: [/\bpaytm\b/i],
  },
  {
    key: "bhim",
    display: "BHIM",
    source: "upi",
    patterns: [/\bbhim\b/i],
  },
  {
    key: "cred",
    display: "CRED",
    source: "upi",
    patterns: [/\bcred\b/i],
  },
  {
    key: "amazonpay",
    display: "Amazon Pay",
    source: "upi",
    patterns: [/\bamazon\s*pay\b/i],
  },
  {
    key: "mobikwik",
    display: "MobiKwik",
    source: "upi",
    patterns: [/\bmobikwik\b/i],
  },
  {
    key: "freecharge",
    display: "Freecharge",
    source: "upi",
    patterns: [/\bfreecharge\b/i],
  },
  {
    key: "slice",
    display: "slice",
    source: "upi",
    patterns: [/\bslice\b/i],
  },
  {
    key: "jupiter",
    display: "Jupiter",
    source: "upi",
    patterns: [/\bjupiter\s*money\b/i],
  },
  {
    key: "fi",
    display: "Fi",
    source: "upi",
    patterns: [/\bfi\s*money\b/i],
  },
  {
    key: "navi",
    display: "Navi",
    source: "upi",
    patterns: [/\bnavi\s*upi\b/i],
  },
  {
    key: "whatsapp",
    display: "WhatsApp Pay",
    source: "upi",
    patterns: [/\bwhatsapp\s*pay\b/i],
  },
];

/**
 * Bank / issuer names (also common SMS sender short-code fragments).
 * Used to filter merchant candidates (a bare bank name is not a merchant) and
 * to give a fallback merchant label when nothing better is found.
 */
export const BANKS: { key: string; display: string; patterns: RegExp[] }[] = [
  { key: "hdfc", display: "HDFC Bank", patterns: [/\bhdfc\b/i] },
  { key: "sbi", display: "SBI", patterns: [/\bsbi\b/i, /state\s+bank/i] },
  { key: "icici", display: "ICICI Bank", patterns: [/\bicici\b/i] },
  { key: "axis", display: "Axis Bank", patterns: [/\baxis\b/i] },
  { key: "kotak", display: "Kotak", patterns: [/\bkotak\b/i] },
  {
    key: "yes",
    display: "YES Bank",
    patterns: [/\byes\s*bank\b/i, /\byesb\b/i],
  },
  { key: "pnb", display: "PNB", patterns: [/\bpnb\b/i, /punjab\s+national/i] },
  {
    key: "bob",
    display: "Bank of Baroda",
    patterns: [/\bbob\b/i, /bank\s+of\s+baroda/i],
  },
  { key: "canara", display: "Canara Bank", patterns: [/\bcanara\b/i] },
  { key: "union", display: "Union Bank", patterns: [/\bunion\s+bank\b/i] },
  { key: "idbi", display: "IDBI Bank", patterns: [/\bidbi\b/i] },
  {
    key: "indusind",
    display: "IndusInd",
    patterns: [/\bindusind\b/i, /\bindus\b/i],
  },
  { key: "rbl", display: "RBL Bank", patterns: [/\brbl\b/i] },
  { key: "federal", display: "Federal Bank", patterns: [/\bfederal\b/i] },
  { key: "idfc", display: "IDFC FIRST", patterns: [/\bidfc\b/i] },
  {
    key: "indian",
    display: "Indian Bank",
    patterns: [/\bindian\s+bank\b/i, /\biob\b/i],
  },
  {
    key: "central",
    display: "Central Bank",
    patterns: [/\bcbi\b/i, /central\s+bank/i],
  },
  {
    key: "au",
    display: "AU Bank",
    patterns: [/\bau\s+small\b/i, /\bau\s+bank\b/i],
  },
  { key: "bandhan", display: "Bandhan Bank", patterns: [/\bbandhan\b/i] },
];

/** Verbs / phrases that indicate a real money movement. */
export const PAYMENT_VERBS = [
  "debited",
  "credited",
  "withdrawn",
  "spent",
  "paid",
  "sent",
  "received",
  "purchase",
  "transferred",
  "transfer",
  "deducted",
  "charged",
  "debit",
  "credit",
];

/** Rails / instrument tokens that co-occur with real payments. */
export const RAIL_TOKENS = [
  "upi",
  "imps",
  "neft",
  "rtgs",
  "vpa",
  "a/c",
  "acct",
  "account",
  "card",
  "wallet",
  "mandate",
  "autopay",
  "e-mandate",
  "ecom",
  "pos",
  "atm",
];

/** Words that mark a *balance / limit*, never a transaction amount. */
export const BALANCE_MARKERS = [
  "avl bal",
  "avlbal",
  "available balance",
  "avail bal",
  "avail. bal",
  "avbl",
  "a/c bal",
  "acct bal",
  "account balance",
  "cleared balance",
  "ledger balance",
  "closing bal",
  "closing balance",
  "current bal",
  "current balance",
  "net bal",
  "net balance",
  "total avail",
  "avl limit",
  "available limit",
  "credit limit",
  "outstanding",
  "min amt due",
  "total due",
  "balance is",
  "bal is",
  "bal:",
  "bal.",
];

/** Words that mark a reference / identifier, never an amount. */
export const REFERENCE_MARKERS = [
  "ref",
  "txn",
  "transaction id",
  "utr",
  "rrn",
  "id",
  "no.",
  "number",
  "a/c",
  "acct",
  "account",
  "card ending",
  "card no",
  "ending",
  "xx",
];

/** Non-payment message types we never want to import. */
export const OTP_RE =
  /\b(?:otp|one[\s-]?time\s+password|verification\s+code|do\s+not\s+share|secret\s+code|passcode|login\s+code)\b/i;

/** Promo / marketing markers (soft signal — only used to reject when no txn verb). */
export const PROMO_RE =
  /\b(?:offer|cashback\s+up\s+to|discount|sale|coupon|voucher|win\b|congratulations|claim\s+now|limited\s+period|apply\s+now|lowest\s+price|off\b|flat\s+\d+%|hurry)\b/i;

/**
 * Detect the payment app or bank from message text + optional sender address.
 * Returns a display brand (for merchant fallback) and a ParsedSource for logo.
 */
export function detectAppOrBank(
  text: string,
  address?: string | null,
): { source: ParsedSource; brand: string | null } {
  const hay = `${text} ${address ?? ""}`;

  for (const app of APPS) {
    if (app.patterns.some((re) => re.test(hay))) {
      return { source: app.source, brand: app.display };
    }
  }
  for (const bank of BANKS) {
    if (bank.patterns.some((re) => re.test(hay))) {
      return { source: "sms", brand: bank.display };
    }
  }
  return { source: "unknown", brand: null };
}

/** True when the trimmed token equals a bare bank name (not a real merchant). */
export function isBankName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return BANKS.some((b) =>
    b.patterns.some((re) => {
      const m = t.match(re);
      // Whole-string-ish match: the bank word dominates the candidate
      return m != null && m[0].length >= t.length - 6;
    }),
  );
}

/** Build a single alternation regex from a word list (word-boundaried). */
export function verbAlternation(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i");
}
