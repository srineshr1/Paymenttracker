import type { ParsedDirection, ParsedSource } from "./types.js";

/** Fix common OCR glitches on Indian UPI screenshots */
export function normalizeOcrText(text: string): string {
  return (
    text
      .replace(/\u00a0/g, " ")
      .replace(/[|]/g, "I")
      .replace(/\r\n/g, "\n")
      // Rupee symbol often misread
      .replace(/[₹₽]/g, "₹")
      .replace(/(?:^|[\s])(?:Rs\.?|INR|rs)(?=\s*[\d,])/gi, " ₹")
      // "%5,000" style (₹ → %)
      .replace(/%\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/g, "₹$1")
      // "Paid to 74,000" where leading 7 is misread ₹ before 4,000
      .replace(
        /(paid\s+to|sent\s+to|received\s+from)\s+7([0-9],[0-9]{2,3}(?:\.[0-9]{1,2})?)/gi,
        "$1 ₹$2",
      )
      .replace(
        /(paid\s+to|sent\s+to)\s+7([0-9]{3,6}(?:\.[0-9]{1,2})?)\b/gi,
        "$1 ₹$2",
      )
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

export function detectSource(text: string): ParsedSource {
  const t = text.toLowerCase();
  if (
    t.includes("phonepe") ||
    t.includes("phone pe") ||
    t.includes("debited from") ||
    (t.includes("paid to") && t.includes("history"))
  ) {
    return "phonepe";
  }
  // Multiple "Paid to" rows is almost always PhonePe/GPay history
  const paidCount = (t.match(/paid\s+to/g) || []).length;
  if (paidCount >= 2) return "phonepe";

  if (
    t.includes("google pay") ||
    t.includes("gpay") ||
    t.includes("g pay") ||
    t.includes("tez")
  ) {
    return "gpay";
  }
  return "unknown";
}

/**
 * Parse an amount token, repairing common OCR glitches for ₹ on PhonePe/GPay:
 *   ₹4,000  → 74,000 / %4,000
 *   ₹49,999 → 249,999 / 749,999
 *
 * Prefer {@link parseHistoryAmountToken} inside history-list parsing when the
 * token may also have a glued leading "2" (₹100 → 2100) — that heuristic is
 * too aggressive for success-screen IDs / real ₹2,xxx amounts.
 */
export function parseAmountToken(raw: string): string | null {
  let s = raw
    .replace(/[₹%¥₽]/g, "")
    .replace(/[^\d,.]/g, "")
    .trim();
  if (!s) return null;

  // Comma-grouped: strip glued leading 7 (₹→7) e.g. 74,000 → 4,000
  // Also 249,999 / 749,999 → 49,999 when first digit is 2|7 and rest groups cleanly
  const commaGlued = s.match(/^([27])(\d{1,2}),(\d{3})(?:\.(\d{1,2}))?$/);
  if (commaGlued) {
    const rest = Number(`${commaGlued[2]}${commaGlued[3]}`);
    // Only strip when remainder looks like a typical UPI amount (≤ 1e6)
    if (rest >= 1 && rest <= 1_000_000) {
      s = `${commaGlued[2]},${commaGlued[3]}${
        commaGlued[4] != null ? `.${commaGlued[4]}` : ""
      }`;
    }
  }

  const cleaned = s.replace(/,/g, "");
  let nStr = cleaned;

  // No-comma: leading 7 glued onto 3–5 digit amounts (₹4,000 → 74000)
  // Do NOT strip leading 2 here — breaks real ₹2,500 and txn ids.
  if (/^7\d{3,5}(\.\d{1,2})?$/.test(cleaned)) {
    const alt = cleaned.slice(1);
    const altN = Number(alt);
    if (Number.isFinite(altN) && altN >= 1 && altN <= 500000) nStr = alt;
  }

  const n = Number(nStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * History-list amount token: same as parseAmountToken plus leading-2 ₹ glue
 * for 3-digit amounts (₹100 → OCR "2100") which is common when ML Kit/Tesseract
 * eat the rupee glyph into a leading "2".
 *
 * Does NOT strip 2-digit tokens (21–29) by default — real UPI amounts like ₹25
 * are common. Use {@link parseGluedHistoryAmountToken} only for bare
 * "Paid to 21" style lines where PhonePe OCR glues ₹→2 onto ₹1–₹9.
 *
 * Never applies the no-comma "2xxx→xxx" strip when the source token had a comma
 * (so real ₹2,500 stays 2500, while OCR "2100" for ₹100 still becomes 100).
 */
export function parseHistoryAmountToken(raw: string): string | null {
  const base = parseAmountToken(raw);
  const s = raw
    .replace(/[₹%¥₽]/g, "")
    .replace(/[^\d,.]/g, "")
    .trim();
  if (!s) return base;

  const hadComma = s.includes(",");
  const cleaned = s.replace(/,/g, "");
  // ₹100 → 2100 — only when OCR omitted commas (not "2,500")
  if (!hadComma && /^2\d{3}(\.\d{1,2})?$/.test(cleaned)) {
    const alt = cleaned.slice(1);
    const altN = Number(alt);
    if (altN >= 100 && altN <= 999) return altN.toFixed(2);
  }
  // Prefer base (handles 249,999 → 49,999 etc.)
  return base;
}

/**
 * Aggressive PhonePe label glue: "Paid to 21" → ₹1, "Paid to 25" → ₹5.
 * Only call when the token sits alone after Paid to / Payment to with no ₹ glyph.
 */
export function parseGluedHistoryAmountToken(raw: string): string | null {
  const s = raw
    .replace(/[₹%¥₽]/g, "")
    .replace(/[^\d,.]/g, "")
    .trim();
  if (!s) return parseHistoryAmountToken(raw);

  const hadComma = s.includes(",");
  const cleaned = s.replace(/,/g, "");
  // ₹1 → 21 / ₹5 → 25 (2-digit, single-digit remainder only)
  if (!hadComma && /^2[1-9]$/.test(cleaned)) {
    return Number(cleaned.slice(1)).toFixed(2);
  }
  return parseHistoryAmountToken(raw);
}

export function extractAmount(text: string): string | null {
  const patterns = [
    /(?:₹|rs\.?|inr|%)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i,
    /(?:paid|sent|received|debited|credited)\s+(?:to\s+)?(?:₹|rs\.?|inr|%|7)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i,
    /\b([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)\b/,
    /\b([0-9]+\.[0-9]{2})\b/,
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

export function extractAllAmounts(text: string): string[] {
  const re =
    /(?:₹|rs\.?|inr|%)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)|(?:paid\s+to|sent\s+to)\s+(?:₹|rs\.?|%|7)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = m[1] || m[2];
    if (!token) continue;
    const parsed = parseAmountToken(token);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function extractUpiRef(text: string): string | null {
  const patterns = [
    /(?:upi\s*(?:ref(?:erence)?(?:\s*no\.?)?|transaction\s*id|txn\s*id)|transaction\s*id|utr)\s*[:-]?\s*([A-Z0-9]{8,40})/i,
    /\b(T\d{10,}[A-Z0-9]*)\b/,
    /\b([0-9]{12})\b/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function extractDirection(text: string): ParsedDirection {
  const t = text.toLowerCase();
  if (
    /\b(received|credited|credit|you received|money received|received from)\b/.test(
      t,
    ) &&
    !/\b(paid to|sent to|you paid|debited)\b/.test(t)
  ) {
    return "credit";
  }
  return "debit";
}

export function extractStatus(
  text: string,
): "success" | "failed" | "pending" | "unknown" {
  const t = text.toLowerCase();
  if (/\b(failed|declined|unsuccessful|cancelled|canceled)\b/.test(t)) {
    return "failed";
  }
  if (/\b(pending|processing|in progress)\b/.test(t)) return "pending";
  if (
    /\b(success|successful|completed|paid successfully|payment successful|transaction successful|debited from)\b/.test(
      t,
    )
  ) {
    return "success";
  }
  // History rows without failure markers are completed payments
  if (/\bpaid\s+to\b/.test(t)) return "success";
  return "unknown";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function extractRelativePaidAt(
  text: string,
  now = new Date(),
): string | null {
  const t = text.toLowerCase();
  if (/\bjust\s+now\b/.test(t) || /\ba\s+moment\s+ago\b/.test(t)) {
    return now.toISOString();
  }
  if (/\byesterday\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }
  // "1 min ago" / "3 mins ago" / "2 minutes ago" / OCR "1 minago"
  const mMin = t.match(/(\d+)\s*min(?:ute)?s?\s*ago/);
  if (mMin) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - Number(mMin[1]));
    return d.toISOString();
  }
  const mHr = t.match(/(\d+)\s*hours?\s*ago/);
  if (mHr) {
    const d = new Date(now);
    d.setHours(d.getHours() - Number(mHr[1]));
    return d.toISOString();
  }
  const mDay = t.match(/(\d+)\s*days?\s*ago/);
  if (mDay) {
    const d = new Date(now);
    d.setDate(d.getDate() - Number(mDay[1]));
    return d.toISOString();
  }
  const mWeek = t.match(/(\d+)\s*weeks?\s*ago/);
  if (mWeek) {
    const d = new Date(now);
    d.setDate(d.getDate() - Number(mWeek[1]) * 7);
    return d.toISOString();
  }
  return null;
}

export function extractPaidAt(text: string): string | null {
  const relative = extractRelativePaidAt(text);
  if (relative) return relative;

  // 17 Jul 2026, 11:32 am  |  17 July 2026 at 11:32 PM
  const re1 =
    /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:[,\s]+| at\s+)(\d{1,2}):(\d{2})\s*(am|pm)?/i;
  const m1 = text.match(re1);
  if (m1) {
    const day = Number(m1[1]);
    const month = MONTHS[m1[2].toLowerCase()];
    const year = Number(m1[3]);
    let hour = Number(m1[4]);
    const minute = Number(m1[5]);
    const ampm = m1[6]?.toLowerCase();
    if (month === undefined) return null;
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const d = new Date(year, month, day, hour, minute, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 17/07/2026 11:32
  const re2 = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})/;
  const m2 = text.match(re2);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    const year = Number(m2[3]);
    const hour = Number(m2[4]);
    const minute = Number(m2[5]);
    const d = new Date(year, month, day, hour, minute, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 17 Jul 2026 (date only)
  const re3 = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/;
  const m3 = text.match(re3);
  if (m3) {
    const day = Number(m3[1]);
    const month = MONTHS[m3[2].toLowerCase()];
    const year = Number(m3[3]);
    if (month === undefined) return null;
    const d = new Date(year, month, day, 12, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

export function extractMerchant(
  text: string,
  patterns: RegExp[],
): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = cleanMerchantName(m[1]);
      if (name) return name;
    }
  }
  return null;
}

export function cleanMerchantName(raw: string): string | null {
  const name = raw
    .replace(/\s+/g, " ")
    .replace(/[^\w\s.&'@\-+]/g, "")
    .replace(/^(to|from)\s+/i, "")
    .trim();
  if (name.length < 2 || name.length > 120) return null;
  // Reject pure numbers / amount-like tokens
  if (/^[\d,.]+$/.test(name)) return null;
  if (/^(mins?|hours?|days?|ago|debited|from)$/i.test(name)) return null;
  return name;
}

export function isLikelyMerchantLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 80) return false;
  // Whole-line chrome only (don't reject "Asha Stores" because of "Stores")
  if (
    /^(paid\s*to|payment\s*to|sent\s+to|received\s+from|you\s+paid|debited(\s+from)?|search|month|categories|filters|home|stores|insurance|wealth|history|share|edit|lens|delete)$/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/\b(paid\s*to|sent\s+to|debited\s+from|received\s+from)\b/i.test(t)) {
    return false;
  }
  if (/^\d+\s*min(?:ute)?s?\s*ago/i.test(t)) return false;
  if (/^\d+\s*hours?\s*ago/i.test(t)) return false;
  if (/^\d+\s*days?\s*ago/i.test(t)) return false;
  if (/^(₹|rs\.?|%|x)/i.test(t) && /[0-9]/.test(t)) return false; // amount-only "X250"
  if (/^[\d,.\s%₹xX]+$/.test(t)) return false;
  // Needs at least one letter
  if (!/[A-Za-z]/.test(t)) return false;
  // Reject "X100"-style amount lines with a single letter prefix
  if (/^[A-Za-z][0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?$/.test(t))
    return false;
  return true;
}

export function scoreConfidence(parts: {
  amount: string | null;
  merchant: string | null;
  paidAt: string | null;
  upiRef: string | null;
  status: string;
  source: ParsedSource;
}): number {
  let score = 0;
  if (parts.amount) score += 0.35;
  if (parts.merchant) score += 0.25;
  if (parts.paidAt) score += 0.15;
  if (parts.upiRef) score += 0.15;
  if (parts.status === "success") score += 0.05;
  // phonepe/gpay/sms all count as a known channel
  if (parts.source !== "unknown") score += 0.05;
  return Math.min(1, Math.round(score * 100) / 100);
}
