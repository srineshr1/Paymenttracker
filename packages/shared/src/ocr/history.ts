import {
  cleanMerchantName,
  detectSource,
  extractDirection,
  extractPaidAt,
  extractRelativePaidAt,
  extractStatus,
  isLikelyMerchantLine,
  normalizeOcrText,
  parseAmountToken,
  parseGluedHistoryAmountToken,
  parseHistoryAmountToken,
  scoreConfidence,
} from "./shared.js";
import type { ParsedExpense, ParsedSource } from "./types.js";

/** Start of a history row label (PhonePe / GPay list UI). Space after Paid optional (OCR: "Paidto"). */
const ROW_LABEL_RE =
  /\b((?:paid|payment)\s*to|sent\s+to|received\s+from|you\s+paid|you\s+received)\b/i;

/**
 * Money-like token after a row label. Captures optional OCR currency junk
 * (₹ % ¥ 7 2) then Indian-grouped or plain digits.
 */
const AMOUNT_ON_LINE_RE =
  /(?:₹|rs\.?|inr|%|¥|₽)?\s*([27]%?)?([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;

/** Currency-prefixed amount (₹ / Rs / OCR junk % ¥ x). */
const CURRENCY_AMOUNT_RE =
  /(?:₹|rs\.?|inr|%|¥|₽|x)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

/** Bare money-like number (Indian commas or plain). */
const BARE_AMOUNT_RE =
  /([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{1,7}(?:\.[0-9]{1,2})?)/g;

/**
 * Strip relative-time phrases so "1 day ago" / "3 mins ago" never become amounts.
 * GPay/PhonePe history rows always show these next to the real ₹ amount.
 */
function stripRelativeTimePhrases(text: string): string {
  return text
    .replace(/\b\d+\s*min(?:ute)?s?\s*ago\b/gi, " ")
    .replace(/\b\d+\s*hours?\s*ago\b/gi, " ")
    .replace(/\b\d+\s*days?\s*ago\b/gi, " ")
    .replace(/\b\d+\s*weeks?\s*ago\b/gi, " ")
    .replace(/\bjust\s+now\b/gi, " ")
    .replace(/\ba\s+moment\s+ago\b/gi, " ")
    .replace(/\byesterday\b/gi, " ");
}

function isRowStart(line: string): boolean {
  return ROW_LABEL_RE.test(line);
}

function isNoiseLine(line: string): boolean {
  return /^(month|categories|filters|search|home|stores|insurance|wealth|history|share|edit|lens|delete|transaction\s+history|add\s+address)/i.test(
    line.trim(),
  );
}

/**
 * True when the line is only UI chrome / relative time / status (no money).
 */
function isNonAmountLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^\d+\s*(?:min(?:ute)?s?|hours?|days?|weeks?)\s*ago$/i.test(t))
    return true;
  if (/^(debited\s+from|credited\s+to|failed|pending|success)$/i.test(t))
    return true;
  return false;
}

/**
 * Extract amount from a history row line / block.
 *
 * Strategy (order matters — GPay OCR often puts "1 day ago" before "₹110"):
 * 1. Currency-marked amounts anywhere in the row (prefer last = right-aligned UI)
 * 2. Amount glued after Paid to / Received from label
 * 3. Whole-line bare amounts
 * 4. Other bare numbers with relative-time phrases stripped first
 */
function extractHistoryAmount(...chunks: string[]): string | null {
  const nonempty = chunks.map((c) => c?.trim() ?? "").filter(Boolean);
  if (nonempty.length === 0) return null;

  // --- Pass 1: currency-marked across the whole row (skip relative-time lines) ---
  // Use parseAmountToken (not history glue): "₹25" must stay 25, not become 5
  // via the old ₹→2 OCR heuristic.
  const markedParsed: string[] = [];
  for (const chunk of nonempty) {
    if (isNonAmountLine(chunk)) continue;
    const cleaned = stripRelativeTimePhrases(chunk);
    for (const m of cleaned.matchAll(CURRENCY_AMOUNT_RE)) {
      const parsed = parseAmountToken(m[1]);
      if (parsed) markedParsed.push(parsed);
    }
  }
  if (markedParsed.length > 0) {
    // Right-aligned amount is usually last when OCR emits multiple tokens
    return markedParsed[markedParsed.length - 1] ?? null;
  }

  // --- Pass 2: "Paid to 49,999" / "Paidto 249,999" / "Paid to 21" on label ---
  for (const chunk of nonempty) {
    const afterLabel =
      chunk.match(/(?:paid|payment)\s*to\s+(.+)$/i) ||
      chunk.match(/received\s+from\s+(.+)$/i) ||
      chunk.match(/you\s+paid\s+(.+)$/i) ||
      chunk.match(/you\s+received\s+(.+)$/i);
    if (!afterLabel?.[1]) continue;
    const tail = stripRelativeTimePhrases(afterLabel[1]).trim();
    // Prefer currency still in tail — trust literal (₹25 stays 25)
    const cur = [...tail.matchAll(CURRENCY_AMOUNT_RE)];
    if (cur.length > 0) {
      const parsed = parseAmountToken(cur[cur.length - 1][1]);
      if (parsed) return parsed;
    }
    // Bare amount-only tail: PhonePe often glues ₹→2 ("Paid to 21" = ₹1)
    if (/^[\d,.%¥xX\s+]+$/.test(tail)) {
      const asAmt = parseGluedHistoryAmountToken(tail);
      if (asAmt) return asAmt;
    }
    // Last number on the label tail (merchant + amount on one line)
    const toks = [...tail.matchAll(BARE_AMOUNT_RE)];
    if (toks.length > 0) {
      const parsed = parseHistoryAmountToken(toks[toks.length - 1][1]);
      if (parsed) return parsed;
    }
  }

  // --- Pass 3: whole line is just an amount ---
  for (const chunk of nonempty) {
    if (isNonAmountLine(chunk)) continue;
    const whole = stripRelativeTimePhrases(chunk).trim();
    if (
      /^(?:₹|rs\.?|inr|%|¥|x)?\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?$/i.test(
        whole,
      ) ||
      /^(?:₹|rs\.?|inr|%|¥|x)?\s*[0-9]{1,7}(?:\.[0-9]{1,2})?$/i.test(whole) ||
      /^\+?\s*(?:₹|rs\.?|inr|%|¥|x)?\s*[0-9]{1,7}(?:\.[0-9]{1,2})?$/i.test(
        whole,
      )
    ) {
      const parsed = parseHistoryAmountToken(whole.replace(/^\+/, ""));
      if (parsed) return parsed;
    }
  }

  // --- Pass 4: bare numbers with relative times removed (never "1" from "1 day ago") ---
  const bareParsed: string[] = [];
  for (const chunk of nonempty) {
    if (isNonAmountLine(chunk)) continue;
    const cleaned = stripRelativeTimePhrases(chunk);
    // Skip pure status leftovers
    if (/^debited\s+from\s*$/i.test(cleaned.trim())) continue;
    for (const m of cleaned.matchAll(BARE_AMOUNT_RE)) {
      const parsed = parseHistoryAmountToken(m[1]);
      if (parsed) bareParsed.push(parsed);
    }
  }
  if (bareParsed.length > 0) {
    return bareParsed[bareParsed.length - 1] ?? null;
  }

  return null;
}

function scrubMerchantCandidate(raw: string): string {
  return (
    raw
      .replace(/^[^A-Za-z0-9]+/, "") // leading OCR junk: "@B", "W ", "5 "
      .replace(/\bdebited\s+from\b.*$/i, "")
      .replace(/\bcredited\s+to\b.*$/i, "")
      .replace(/\bfailed\b.*$/i, "")
      // Trailing amount glued by OCR: "Nikhil @MVSR 18" / "IOCL ₹110" / "+2"
      .replace(
        /\s*[+]?[₹%¥₽xX]?\s*[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?\s*$/i,
        "",
      )
      .replace(/\s*[+]?[₹%¥₽xX]?\s*[0-9]{1,7}(?:\.[0-9]{1,2})?\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractHistoryMerchant(
  labelLine: string,
  block: string[],
): string | null {
  // Merchant rarely sits on the label line for PhonePe history (amount is there)
  const after = scrubMerchantCandidate(
    labelLine
      .replace(ROW_LABEL_RE, "")
      .replace(AMOUNT_ON_LINE_RE, "")
      .replace(/[₹%¥₽]/g, "")
      .replace(/[0-9,.\s]+/g, " "),
  );
  if (after && isLikelyMerchantLine(after)) {
    return cleanMerchantName(after);
  }

  for (const line of block) {
    if (isRowStart(line) || isNoiseLine(line)) continue;
    const cleaned = scrubMerchantCandidate(line);
    if (!cleaned) continue;
    // Skip pure date / status lines
    if (extractRelativePaidAt(cleaned) || extractPaidAt(cleaned)) {
      const withoutDate = cleaned
        .replace(/\d+\s*min(?:ute)?s?\s*ago/i, "")
        .replace(/\d+\s*hours?\s*ago/i, "")
        .replace(/\d+\s*days?\s*ago/i, "")
        .replace(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}/i, "")
        .trim();
      if (!withoutDate || !isLikelyMerchantLine(withoutDate)) continue;
    }
    if (/^debited\s+from|^failed$|^pending$/i.test(cleaned)) continue;
    if (isLikelyMerchantLine(cleaned)) {
      return cleanMerchantName(cleaned);
    }
  }
  return null;
}

function extractHistoryPaidAt(
  block: string[],
  labelLine: string,
): string | null {
  const chunks = [labelLine, ...block];
  for (const line of chunks) {
    const rel = extractRelativePaidAt(line);
    if (rel) return rel;
  }
  for (const line of chunks) {
    const abs = extractPaidAt(line);
    if (abs) return abs;
  }
  return null;
}

function blockStatus(
  labelLine: string,
  block: string[],
): ParsedExpense["status"] {
  return extractStatus([labelLine, ...block].join(" "));
}

/**
 * Parse PhonePe / GPay *history list* screenshots that contain multiple rows:
 *
 *   Paid to                    ₹4,000
 *   Mourvi Agencies
 *   3 mins ago              Debited from
 */
export function parseHistoryListOcr(raw: string): ParsedExpense[] {
  const text = normalizeOcrText(raw);
  const source: ParsedSource =
    detectSource(text) === "unknown" ? "phonepe" : detectSource(text);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isNoiseLine(l));

  // Collect row start indices
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isRowStart(lines[i])) starts.push(i);
  }

  const results: ParsedExpense[] = [];

  for (let s = 0; s < starts.length; s++) {
    const i = starts[s];
    const end =
      s + 1 < starts.length ? starts[s + 1] : Math.min(lines.length, i + 6);
    const labelLine = lines[i];
    const block = lines.slice(i + 1, end);

    const direction: ParsedExpense["direction"] = /received/i.test(labelLine)
      ? "credit"
      : extractDirection(labelLine + " " + block.join(" "));

    const status = blockStatus(labelLine, block);
    // Skip failed history rows (user cannot spend a failed txn)
    if (status === "failed") continue;

    const amount = extractHistoryAmount(labelLine, ...block);
    const merchant = extractHistoryMerchant(labelLine, block);
    const paidAt = extractHistoryPaidAt(block, labelLine);

    if (!amount && !merchant) continue;
    // Drop pure UI chrome labels only — do NOT match substrings like
    // "MADRAS FILTER COFFEE" (real merchant containing the word "filter").
    if (
      merchant &&
      /^(search|add\s*address|address|filters?|categories|month|home|history|stores|insurance|wealth)$/i.test(
        merchant.trim(),
      )
    ) {
      continue;
    }

    const confidence = scoreConfidence({
      amount,
      merchant,
      paidAt,
      upiRef: null,
      status: status === "unknown" ? "success" : status,
      source,
    });

    const warnings: string[] = [];
    if (!amount) warnings.push("Could not detect amount");
    if (!merchant) warnings.push("Could not detect merchant");
    if (!paidAt) warnings.push("Could not detect date — using now");

    results.push({
      amount,
      currency: "INR",
      direction,
      merchant,
      paidAt: paidAt ?? new Date().toISOString(),
      upiRef: null,
      source: source === "unknown" ? "phonepe" : source,
      status: status === "unknown" ? "success" : status,
      confidence: Math.max(confidence, amount && merchant ? 0.6 : confidence),
      rawText: [labelLine, ...block].join("\n"),
      warnings,
    });
  }

  return results;
}

/** True when screenshot looks like a multi-row history feed */
export function looksLikeHistoryList(text: string): boolean {
  const t = normalizeOcrText(text).toLowerCase();
  // Allow "Paidto" (no space) from noisy OCR
  const paid =
    (t.match(/\bpaid\s*to\b/g) || []).length +
    (t.match(/\bpayment\s*to\b/g) || []).length +
    (t.match(/\byou\s+paid\b/g) || []).length +
    (t.match(/\breceived\s+from\b/g) || []).length;
  const relative = (
    t.match(
      /\d+\s*min(?:ute)?s?\s*ago|\d+\s*hours?\s*ago|\d+\s*days?\s*ago/g,
    ) || []
  ).length;
  // Need 2+ payment rows, or one row + relative time (history UI). Do NOT treat a
  // single success screen ("Paid to X" + absolute date) as a history list.
  return paid >= 2 || (paid >= 1 && relative >= 1 && /\bdebited\b/.test(t));
}
