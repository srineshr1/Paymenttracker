import {
  cleanMerchantName,
  detectSource,
  extractDirection,
  extractPaidAt,
  extractRelativePaidAt,
  extractStatus,
  isLikelyMerchantLine,
  normalizeOcrText,
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

function isRowStart(line: string): boolean {
  return ROW_LABEL_RE.test(line);
}

function isNoiseLine(line: string): boolean {
  return /^(month|categories|filters|search|home|stores|insurance|wealth|history|share|edit|lens|delete|transaction\s+history|add\s+address)/i.test(
    line.trim(),
  );
}

/**
 * Extract amount from a history row line / block.
 * Prefers tokens near the row label; repairs ₹→2/7/% OCR glue.
 */
function extractHistoryAmount(...chunks: string[]): string | null {
  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;
    // Prefer explicit currency-marked amounts first (₹ % ¥ X — OCR sometimes uses X for ₹)
    const marked = [
      ...chunk.matchAll(
        /(?:₹|rs\.?|inr|%|¥|₽|x)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi,
      ),
    ];
    for (const m of marked) {
      const parsed = parseHistoryAmountToken(m[1]);
      if (parsed) return parsed;
    }

    // "Paid to 49,999" / "Paidto 249,999" / "Paid to 2100" (space optional after Paid)
    const afterLabel =
      chunk.match(/(?:paid|payment)\s*to\s+(.+)$/i) ||
      chunk.match(/received\s+from\s+(.+)$/i) ||
      chunk.match(/you\s+paid\s+(.+)$/i);
    if (afterLabel?.[1]) {
      const tail = afterLabel[1].trim();
      const asAmt = parseHistoryAmountToken(tail);
      if (asAmt) return asAmt;
      const tok = tail.match(
        /([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{1,7}(?:\.[0-9]{1,2})?)/,
      );
      if (tok) {
        const parsed = parseHistoryAmountToken(tok[1]);
        if (parsed) return parsed;
      }
    }

    // Whole line is just an amount (common when OCR splits "Paid to" / "₹1")
    const whole = chunk.trim();
    if (
      /^(?:₹|rs\.?|inr|%|¥|x)?\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?$/i.test(
        whole,
      ) ||
      /^(?:₹|rs\.?|inr|%|¥|x)?\s*[0-9]{1,7}(?:\.[0-9]{1,2})?$/i.test(whole)
    ) {
      const parsed = parseHistoryAmountToken(whole);
      if (parsed) return parsed;
    }

    // Generic last money-like token on the line (right-aligned amount)
    const all = [
      ...chunk.matchAll(
        /([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{1,7}(?:\.[0-9]{1,2})?)/g,
      ),
    ];
    if (all.length > 0) {
      const last = all[all.length - 1][1];
      const parsed = parseHistoryAmountToken(last);
      if (parsed) return parsed;
    }
  }
  return null;
}

function scrubMerchantCandidate(raw: string): string {
  return raw
    .replace(/^[^A-Za-z0-9]+/, "") // leading OCR junk: "@B", "W ", "5 "
    .replace(/\bdebited\s+from\b.*$/i, "")
    .replace(/\bfailed\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
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
    if (merchant && /search|address|filter|categories/i.test(merchant))
      continue;

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
