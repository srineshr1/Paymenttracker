import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseUpiScreenshotAll } from "./parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "__fixtures__", "history");

type ExpectedRow = {
  merchant: string;
  amount: string;
  direction?: "debit" | "credit";
  status?: string;
  paidAtDate?: string | null;
  paidAtRelative?: boolean;
};

type Sample = {
  id: string;
  ocrText?: string;
  ocrFile?: string;
  expected: ExpectedRow[];
  expectCount?: number;
  expectCountMin?: number;
  /** Noisy OCR — warn instead of fail CI */
  optional?: boolean;
};

type Dataset = { samples: Sample[] };

function loadOcr(sample: Sample): string {
  if (sample.ocrText) return sample.ocrText;
  if (sample.ocrFile) {
    return readFileSync(join(FIXTURE_DIR, sample.ocrFile), "utf8");
  }
  throw new Error(`Sample ${sample.id} has no ocrText/ocrFile`);
}

function merchantLooseMatch(
  got: string | null | undefined,
  exp: string,
): boolean {
  if (!got) return false;
  const g = got.toLowerCase().replace(/\s+/g, " ").trim();
  const e = exp.toLowerCase().replace(/\s+/g, " ").trim();
  return g.includes(e) || e.includes(g);
}

function datePrefix(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Local calendar date from ISO — paidAt is stored as ISO from local Date
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const dataset = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "dataset.json"), "utf8"),
) as Dataset;

describe("history OCR dataset", () => {
  for (const sample of dataset.samples) {
    it(`${sample.id}${sample.optional ? " (optional)" : ""}`, () => {
      const text = loadOcr(sample);
      const rows = parseUpiScreenshotAll(text);

      const soft = sample.optional === true;
      const check = (cond: boolean, msg: string) => {
        if (!cond) {
          if (soft) {
            console.warn(`[optional] ${msg}`);
            return;
          }
          assert.fail(msg);
        }
      };

      if (sample.expectCount != null) {
        check(
          rows.length === sample.expectCount,
          `${sample.id}: expected ${sample.expectCount} rows, got ${rows.length}: ${JSON.stringify(
            rows.map((r) => ({ m: r.merchant, a: r.amount, d: r.paidAt })),
          )}`,
        );
      } else if (sample.expectCountMin != null) {
        check(
          rows.length >= sample.expectCountMin,
          `${sample.id}: expected >=${sample.expectCountMin} rows, got ${rows.length}`,
        );
      }

      for (let i = 0; i < sample.expected.length; i++) {
        const exp = sample.expected[i];
        const got =
          rows.find(
            (r) =>
              r.amount === exp.amount &&
              merchantLooseMatch(r.merchant, exp.merchant),
          ) ?? rows[i];

        check(
          Boolean(got),
          `${sample.id}[${i}]: missing row for ${exp.merchant} ${exp.amount}`,
        );
        if (!got) continue;
        check(
          got.amount === exp.amount,
          `${sample.id}[${i}]: amount want ${exp.amount} got ${got.amount} (merchant=${got.merchant})`,
        );
        check(
          merchantLooseMatch(got.merchant, exp.merchant),
          `${sample.id}[${i}]: merchant want ~${exp.merchant} got ${got.merchant}`,
        );
        if (exp.direction) {
          check(
            got.direction === exp.direction,
            `${sample.id}[${i}]: direction`,
          );
        }
        if (exp.paidAtDate) {
          check(
            datePrefix(got.paidAt) === exp.paidAtDate,
            `${sample.id}[${i}]: date want ${exp.paidAtDate} got ${got.paidAt}`,
          );
        }
        if (exp.paidAtRelative) {
          const ageMs = got.paidAt ? Date.now() - Date.parse(got.paidAt) : -1;
          check(
            ageMs >= 0 && ageMs < 2 * 60 * 60 * 1000,
            `${sample.id}[${i}]: relative paidAt should be recent, got ${got.paidAt}`,
          );
        }
      }
    });
  }
});
