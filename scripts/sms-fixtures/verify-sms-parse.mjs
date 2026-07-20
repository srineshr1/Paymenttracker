#!/usr/bin/env node
/**
 * Offline: run the shared SMS parser against the 3-month fixture.
 * Reports how many payment-like messages were detected, parse success rates,
 * and mismatches vs expected fields (amount / direction / source).
 *
 * Usage:
 *   node scripts/sms-fixtures/verify-sms-parse.mjs
 *   node scripts/sms-fixtures/verify-sms-parse.mjs --fixture path.json
 *   node scripts/sms-fixtures/verify-sms-parse.mjs --verbose
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const VERBOSE = args.includes("--verbose");
const FIXTURE = resolve(
  flag("fixture", resolve(__dirname, "sms-3months.json")),
);

async function loadParser() {
  const candidates = [
    resolve(__dirname, "../../packages/shared/dist/ocr/sms.js"),
    resolve(__dirname, "../../packages/shared/dist/index.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return import(pathToFileURL(p).href);
    }
  }
  throw new Error(
    "Shared package not built. Run: npm run build -w @paymenttracker/shared",
  );
}

function normAmt(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

async function main() {
  if (!existsSync(FIXTURE)) {
    console.error(`Fixture not found: ${FIXTURE}`);
    console.error("Run: node scripts/sms-fixtures/generate-sms-fixture.mjs");
    process.exit(1);
  }

  const { isPaymentSms, parseSmsMessage, parseSmsMessages } =
    await loadParser();
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const messages = fixture.messages ?? [];

  const expectedPayment = messages.filter((m) => m.expected?.isPayment);
  const expectedNoise = messages.filter(
    (m) => m.expected && !m.expected.isPayment,
  );

  // Filter accuracy
  let truePos = 0;
  let falsePos = 0;
  let falseNeg = 0;
  let trueNeg = 0;

  for (const m of messages) {
    const hit = isPaymentSms(m.body, m.address);
    const want = Boolean(m.expected?.isPayment);
    if (hit && want) truePos++;
    else if (hit && !want) falsePos++;
    else if (!hit && want) falseNeg++;
    else trueNeg++;
  }

  // Full pipeline
  const inputs = messages.map((m) => ({
    body: m.body,
    address: m.address,
    dateMs: m.dateMs,
  }));
  const parsed = parseSmsMessages(inputs, {
    minConfidence: 0.35,
    filterNonPayment: true,
  });

  // Field-level checks on expected payments that pass isPaymentSms
  let amountOk = 0;
  let amountFail = 0;
  let directionOk = 0;
  let directionFail = 0;
  let sourceOk = 0;
  let sourceFail = 0;
  let merchantOk = 0;
  let merchantMiss = 0;
  const failures = [];

  for (const m of expectedPayment) {
    if (!isPaymentSms(m.body, m.address)) continue;
    const r = parseSmsMessage({
      body: m.body,
      address: m.address,
      dateMs: m.dateMs,
    });
    const exp = m.expected;

    if (exp.amount) {
      if (normAmt(r.amount) === normAmt(exp.amount)) amountOk++;
      else {
        amountFail++;
        failures.push({
          id: m.id,
          field: "amount",
          expected: exp.amount,
          got: r.amount,
          body: m.body.slice(0, 100),
        });
      }
    }

    if (exp.direction) {
      if (r.direction === exp.direction) directionOk++;
      else {
        directionFail++;
        failures.push({
          id: m.id,
          field: "direction",
          expected: exp.direction,
          got: r.direction,
          body: m.body.slice(0, 100),
        });
      }
    }

    if (exp.source) {
      if (r.source === exp.source) sourceOk++;
      else {
        sourceFail++;
        failures.push({
          id: m.id,
          field: "source",
          expected: exp.source,
          got: r.source,
          body: m.body.slice(0, 100),
        });
      }
    }

    if (exp.merchantHint) {
      const mer = (r.merchant ?? "").toLowerCase();
      const hint = String(exp.merchantHint).toLowerCase();
      if (
        mer.includes(hint.slice(0, Math.min(6, hint.length))) ||
        hint.includes(mer.slice(0, 4))
      ) {
        merchantOk++;
      } else if (!r.merchant) {
        merchantMiss++;
        if (VERBOSE) {
          failures.push({
            id: m.id,
            field: "merchant",
            expected: exp.merchantHint,
            got: r.merchant,
            body: m.body.slice(0, 100),
          });
        }
      } else {
        merchantMiss++;
        if (VERBOSE) {
          failures.push({
            id: m.id,
            field: "merchant",
            expected: exp.merchantHint,
            got: r.merchant,
            body: m.body.slice(0, 100),
          });
        }
      }
    }
  }

  // Aggregate by month for UI sanity
  const byMonth = {};
  for (const p of parsed) {
    const key = (p.paidAt ?? "unknown").slice(0, 7);
    if (!byMonth[key])
      byMonth[key] = { count: 0, debit: 0, credit: 0, sumDebit: 0 };
    byMonth[key].count++;
    if (p.direction === "debit") {
      byMonth[key].debit++;
      byMonth[key].sumDebit += Number(p.amount || 0);
    } else {
      byMonth[key].credit++;
    }
  }

  console.log("═══ SMS fixture parse report ═══");
  console.log(`Fixture: ${FIXTURE}`);
  if (fixture.meta) {
    console.log(
      `Range: ${fixture.meta.range?.from?.slice(0, 10)} → ${fixture.meta.range?.to?.slice(0, 10)} (${fixture.meta.days} days)`,
    );
    console.log(
      `Messages: ${messages.length} (expected payment-like ${expectedPayment.length}, noise ${expectedNoise.length})`,
    );
  }

  console.log("\n── isPaymentSms filter ──");
  console.log(`  true positive:  ${truePos}`);
  console.log(`  true negative:  ${trueNeg}`);
  console.log(`  false positive: ${falsePos}`);
  console.log(`  false negative: ${falseNeg}`);
  const precision = truePos + falsePos > 0 ? truePos / (truePos + falsePos) : 0;
  const recall = truePos + falseNeg > 0 ? truePos / (truePos + falseNeg) : 0;
  console.log(
    `  precision: ${(precision * 100).toFixed(1)}%  recall: ${(recall * 100).toFixed(1)}%`,
  );

  console.log("\n── parseSmsMessages pipeline ──");
  console.log(`  returned expenses: ${parsed.length}`);
  console.log(
    `  (app bulk import saves all confident parses; inbox scan maxCount up to 2000)`,
  );

  console.log("\n── field accuracy (on expected payments that pass filter) ──");
  console.log(
    `  amount:    ${amountOk} ok / ${amountFail} fail` +
      (amountOk + amountFail
        ? ` (${((amountOk / (amountOk + amountFail)) * 100).toFixed(1)}%)`
        : ""),
  );
  console.log(`  direction: ${directionOk} ok / ${directionFail} fail`);
  console.log(`  source:    ${sourceOk} ok / ${sourceFail} fail`);
  console.log(
    `  merchant:  ${merchantOk} matched hint / ${merchantMiss} miss-or-null`,
  );

  console.log("\n── parsed by month ──");
  for (const [month, s] of Object.entries(byMonth).sort()) {
    console.log(
      `  ${month}: ${s.count} txns (${s.debit} debit / ${s.credit} credit), debit sum ₹${s.sumDebit.toFixed(0)}`,
    );
  }

  if (failures.length) {
    console.log(
      `\n── sample failures (showing ${Math.min(15, failures.length)}) ──`,
    );
    for (const f of failures.slice(0, 15)) {
      console.log(
        `  ${f.id} ${f.field}: expected=${f.expected} got=${f.got}\n    ${f.body}`,
      );
    }
  }

  // Exit non-zero if filter/amount is badly broken
  const amountRate =
    amountOk + amountFail > 0 ? amountOk / (amountOk + amountFail) : 1;
  if (recall < 0.9 || precision < 0.9 || amountRate < 0.9) {
    console.error("\n✗ Parse quality below 90% thresholds — investigate.");
    process.exit(2);
  }
  console.log("\n✓ Filter + amount parse look healthy (≥90%).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
