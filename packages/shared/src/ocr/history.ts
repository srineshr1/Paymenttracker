import {
  cleanMerchantName,
  detectSource,
  extractAmount,
  extractDirection,
  extractPaidAt,
  extractRelativePaidAt,
  extractStatus,
  isLikelyMerchantLine,
  normalizeOcrText,
  parseAmountToken,
  scoreConfidence,
} from "./shared.js";
import type { ParsedExpense } from "./types.js";

/**
 * Parse PhonePe / GPay *history list* screenshots that contain multiple rows:
 *
 *   Paid to          ₹4,000
 *   Mourvi Agencies
 *   3 mins ago    Debited from
 */
export function parseHistoryListOcr(raw: string): ParsedExpense[] {
  const text = normalizeOcrText(raw);
  const source = detectSource(text);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: ParsedExpense[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const paidMatch = line.match(
      /^(?:.*?)(?:paid\s+to|sent\s+to|received\s+from)\s*(.*)$/i
    );
    if (!paidMatch) continue;

    const afterLabel = paidMatch[1]?.trim() ?? "";
    const direction = /received/i.test(line) ? "credit" : extractDirection(line);

    // Amount may sit on the same line after "Paid to" (OCR: "Paid to 74,000" / "Paid to %5,000")
    let amount =
      extractAmount(afterLabel) ||
      extractAmount(line) ||
      null;

    // Or amount-only token on the same line
    if (!amount) {
      const amtTok = afterLabel.match(
        /([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{2,7}(?:\.[0-9]{1,2})?)/
      );
      if (amtTok) amount = parseAmountToken(amtTok[1]);
    }

    // Merchant: rest of line after stripping amount, or next line(s)
    let merchant: string | null = null;
    const afterAmount = afterLabel
      .replace(/(?:₹|%|rs\.?|inr)?\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?/gi, "")
      .replace(/^[7%₹\s]+/, "")
      .trim();
    if (afterAmount && isLikelyMerchantLine(afterAmount)) {
      merchant = cleanMerchantName(afterAmount);
    }

    // Peek following lines for merchant / amount / relative date
    let paidAt: string | null = null;
    const window = lines.slice(i + 1, i + 4);
    for (const next of window) {
      if (!merchant && isLikelyMerchantLine(next)) {
        merchant = cleanMerchantName(next);
        continue;
      }
      if (!amount) {
        const a = extractAmount(next) || parseAmountToken(next.replace(/[^\d,.]/g, "") || "");
        if (a) {
          amount = a;
          continue;
        }
      }
      if (!paidAt) {
        paidAt = extractRelativePaidAt(next) || extractPaidAt(next);
      }
    }

    // Also check same line for relative date (rare)
    if (!paidAt) paidAt = extractRelativePaidAt(line) || extractPaidAt(line);

    // Skip junk rows without amount and merchant
    if (!amount && !merchant) continue;

    // Avoid header noise
    if (merchant && /search|address|filter|categories/i.test(merchant)) continue;

    const status = extractStatus(line + " " + window.join(" "));
    if (status === "failed") continue; // skip failed rows in history unless user wants them

    const confidence = scoreConfidence({
      amount,
      merchant,
      paidAt,
      upiRef: null,
      status: status === "unknown" ? "success" : status,
      source: source === "unknown" ? "phonepe" : source,
    });

    const warnings: string[] = [];
    if (!amount) warnings.push("Could not detect amount");
    if (!merchant) warnings.push("Could not detect merchant");
    if (!paidAt) warnings.push("Could not detect date — using now");

    results.push({
      amount,
      currency: "INR",
      direction: direction as "debit" | "credit",
      merchant,
      paidAt: paidAt ?? new Date().toISOString(),
      upiRef: null,
      source: source === "unknown" ? "phonepe" : source,
      status: status === "unknown" ? "success" : status,
      confidence: Math.max(confidence, amount && merchant ? 0.55 : confidence),
      rawText: [line, ...window].join("\n"),
      warnings,
    });
  }

  return results;
}

/** True when screenshot looks like a multi-row history feed */
export function looksLikeHistoryList(text: string): boolean {
  const t = normalizeOcrText(text).toLowerCase();
  const paid = (t.match(/paid\s+to/g) || []).length;
  const relative = (t.match(/\d+\s*(mins?|hours?|days?)\s*ago/g) || []).length;
  return paid >= 2 || (paid >= 1 && relative >= 1 && t.includes("debited"));
}
