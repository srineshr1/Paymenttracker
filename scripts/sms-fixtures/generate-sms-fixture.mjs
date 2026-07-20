#!/usr/bin/env node
/**
 * Generate ~3 months of realistic Indian bank / UPI SMS (+ noise)
 * for testing Spentd SMS read + parse pipeline.
 *
 * Usage:
 *   node scripts/sms-fixtures/generate-sms-fixture.mjs
 *   node scripts/sms-fixtures/generate-sms-fixture.mjs --days 90 --out path.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const DAYS = Number(flag("days", "90"));
const OUT = resolve(
  flag("out", resolve(__dirname, "sms-3months.json"))
);
const SEED = Number(flag("seed", "42"));

// ─── Deterministic PRNG (mulberry32) ─────────────────────────────────────────
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;

// ─── Domain data ─────────────────────────────────────────────────────────────
const MERCHANTS = [
  { name: "Swiggy", vpa: "swiggy@ybl", amounts: [120, 180, 249, 320, 450, 580, 699] },
  { name: "Zomato", vpa: "zomato@paytm", amounts: [150, 220, 310, 420, 550] },
  { name: "Uber India", vpa: "uber@axisbank", amounts: [89, 145, 210, 340, 520, 780] },
  { name: "Ola Cabs", vpa: "ola@ybl", amounts: [95, 160, 250, 390] },
  { name: "Amazon", vpa: "amazon@apl", amounts: [299, 499, 799, 1299, 2499, 4999] },
  { name: "Flipkart", vpa: "flipkart@ybl", amounts: [399, 699, 999, 1599, 2999] },
  { name: "BigBasket", vpa: "bigbasket@icici", amounts: [450, 780, 1200, 1850, 2400] },
  { name: "Blinkit", vpa: "blinkit@ybl", amounts: [180, 320, 490, 670] },
  { name: "IRCTC", vpa: "irctc@sbi", amounts: [540, 890, 1250, 2100, 3500] },
  { name: "BookMyShow", vpa: "bms@ybl", amounts: [250, 400, 600, 900] },
  { name: "Netflix", vpa: "netflix@axisbank", amounts: [199, 499, 649] },
  { name: "Spotify", vpa: "spotify@ybl", amounts: [119] },
  { name: "Jio", vpa: "jio@ybl", amounts: [239, 299, 399, 666] },
  { name: "Airtel", vpa: "airtel@airtel", amounts: [199, 299, 449, 719] },
  { name: "BESCOM", vpa: "bescom@sbi", amounts: [800, 1200, 1850, 2400, 3100] },
  { name: "Petrol Pump", vpa: "iocl@ybl", amounts: [500, 1000, 1500, 2000, 2500] },
  { name: "Dominos", vpa: "dominos@ybl", amounts: [349, 499, 699, 899] },
  { name: "Starbucks", vpa: "starbucks@icici", amounts: [280, 420, 560] },
  { name: "Nykaa", vpa: "nykaa@ybl", amounts: [450, 899, 1299, 2100] },
  { name: "Myntra", vpa: "myntra@ybl", amounts: [799, 1299, 1999, 3499] },
  { name: "PhonePe Recharge", vpa: "recharge@ybl", amounts: [10, 20, 50, 100, 200] },
  { name: "Google Play", vpa: "googleplay@okaxis", amounts: [99, 199, 499, 999] },
];

const PEOPLE = [
  { name: "Ravi Kumar", vpa: "ravi.kumar@oksbi" },
  { name: "Priya Sharma", vpa: "priya.sharma@okhdfcbank" },
  { name: "Amit Patel", vpa: "amit.patel@okicici" },
  { name: "Sneha Reddy", vpa: "sneha@ybl" },
  { name: "Arjun Mehta", vpa: "arjunmehta@paytm" },
  { name: "Kavya Nair", vpa: "kavya.n@oksbi" },
  { name: "Vikram Singh", vpa: "vikram.s@okaxis" },
  { name: "Ananya Iyer", vpa: "ananya@ybl" },
  { name: "Rohit Das", vpa: "rohit.das@okhdfcbank" },
  { name: "Meera Joshi", vpa: "meera.j@okicici" },
];

const BANKS = [
  {
    id: "hdfc",
    address: "VM-HDFCBK",
    acct: "**1234",
    label: "HDFC Bank",
  },
  {
    id: "sbi",
    address: "VK-SBIINB",
    acct: "XX1234",
    label: "SBI",
  },
  {
    id: "icici",
    address: "VM-ICICIB",
    acct: "XX5678",
    label: "ICICI Bank",
  },
  {
    id: "axis",
    address: "VM-AXISBK",
    acct: "XX9012",
    label: "Axis Bank",
  },
];

const PHONEPE_ADDR = "VK-PhonePe";
const GPAY_ADDR = "VK-GOOGLE";

// Running balance simulation (starts ~45k, drifts with spend/credit)
let balance = 45000 + randInt(0, 15000);

function fmtAmt(n) {
  const fixed = Number(n).toFixed(2);
  const [whole, dec] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${dec}`;
}

function fmtDateDDMMYY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function fmtDateDDMonYY(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${months[d.getMonth()]}${yy}`;
}

function fmtDateDDMonYYYY(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateDDMonDash(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${months[d.getMonth()]}-${yy}`;
}

function fmtTime12(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

let upiSeq = 417600000000 + randInt(0, 99999);
function nextUpiRef() {
  upiSeq += randInt(1, 17);
  return String(upiSeq);
}

function applyDebit(amount) {
  balance = Math.max(500, balance - amount + randInt(-50, 50) / 10);
  return balance;
}

function applyCredit(amount) {
  balance = balance + amount;
  return balance;
}

// ─── Message templates ───────────────────────────────────────────────────────

function makeHdfcDebit(d, merchant, amount, upiRef) {
  const bank = BANKS.find((b) => b.id === "hdfc");
  const bal = applyDebit(amount);
  const body = `HDFC Bank: Rs.${fmtAmt(amount)} debited from A/c ${bank.acct} on ${fmtDateDDMMYY(d)} to VPA ${merchant.vpa}. UPI Ref ${upiRef}. Not you? Call 18002586161. Avl Bal Rs.${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makeSbiDebit(d, merchant, amount, upiRef) {
  const bank = BANKS.find((b) => b.id === "sbi");
  const bal = applyDebit(amount);
  const body = `SBI: Rs ${fmtAmt(amount)} debited from A/c ${bank.acct} on ${fmtDateDDMonYY(d)} for UPI/${merchant.name}/${upiRef}. Avl Bal Rs ${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makeIciciDebit(d, merchant, amount, upiRef) {
  const bank = BANKS.find((b) => b.id === "icici");
  const bal = applyDebit(amount);
  const body = `ICICI Bank Acct ${bank.acct} debited for Rs ${fmtAmt(amount)} on ${fmtDateDDMonDash(d)}; UPI:${merchant.vpa}. UPI:${upiRef}. Call 18001080 if not you. Avl Bal Rs ${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makeAxisDebit(d, merchant, amount, upiRef) {
  const bank = BANKS.find((b) => b.id === "axis");
  const bal = applyDebit(amount);
  const body = `Axis Bank: INR ${fmtAmt(amount)} debited from A/c ${bank.acct} on ${fmtDateDDMMYY(d)} to ${merchant.vpa}. UPI Ref No ${upiRef}. Avl Bal: INR ${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makePhonePe(d, merchant, amount, upiRef) {
  const bank = pick(BANKS);
  applyDebit(amount);
  const body = `PhonePe: Paid Rs.${fmtAmt(amount)} to ${merchant.name}. UPI Ref ${upiRef}. Debited from ${bank.label} ${bank.acct}`;
  return {
    address: PHONEPE_ADDR,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "phonepe",
      upiRef,
    },
  };
}

function makeGpay(d, personOrMerchant, amount, upiRef) {
  const name = personOrMerchant.name;
  applyDebit(amount);
  const body = `Google Pay: You paid ₹${fmtAmt(amount)} to ${name}. UPI transaction ID ${upiRef} on ${fmtDateDDMonYYYY(d)}, ${fmtTime12(d)}`;
  return {
    address: GPAY_ADDR,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: name.split(" ")[0],
      source: "gpay",
      upiRef,
    },
  };
}

function makeCredit(d, person, amount, upiRef) {
  const bank = pick(BANKS);
  const bal = applyCredit(amount);
  const body = `Your A/c ${bank.acct} is credited for Rs.${fmtAmt(amount)} on ${fmtDateDDMMYY(d)} from VPA ${person.vpa} (UPI Ref No ${upiRef}). Avl Bal Rs ${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "credit",
      merchantHint: person.name.split(" ")[0],
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makeSalaryCredit(d, amount) {
  const bank = pick([BANKS[0], BANKS[1]]); // HDFC or SBI
  const bal = applyCredit(amount);
  const upiRef = `NEFT${randInt(100000000, 999999999)}`;
  const body = `${bank.label}: A/c ${bank.acct} credited with Rs.${fmtAmt(amount)} on ${fmtDateDDMMYY(d)} by NEFT from ACME CORP SALARY. Ref ${upiRef}. Avl Bal Rs ${fmtAmt(bal)}`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "credit",
      merchantHint: "ACME",
      source: "sms",
      availableBalance: fmtAmt(bal),
      upiRef,
    },
  };
}

function makeAtmWithdraw(d, amount) {
  const bank = pick(BANKS);
  const bal = applyDebit(amount);
  const body = `${bank.label}: Rs.${fmtAmt(amount)} withdrawn from A/c ${bank.acct} at ATM on ${fmtDateDDMMYY(d)}. Avl Bal Rs ${fmtAmt(bal)}. If not you call customer care.`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: null, // may not parse merchant
      source: "sms",
      availableBalance: fmtAmt(bal),
    },
  };
}

// Noise (should NOT parse as payments, or filter out)
function makeOtp(d) {
  const bank = pick(BANKS);
  const otp = randInt(100000, 999999);
  const body = `Your OTP for login is ${otp}. Do not share with anyone. Valid for 5 minutes. - ${bank.label}`;
  return {
    address: bank.address,
    body,
    expected: { isPayment: false },
  };
}

function makePromo(d) {
  const promos = [
    {
      address: "VK-AMAZON",
      body: `Amazon: Flat 50% off on fashion. Shop now at amazon.in/deals. T&C apply. Reply STOP to opt out.`,
    },
    {
      address: "VM-FLIPKT",
      body: `Flipkart: Big Billion Days start soon! Pre-book deals worth Rs.5000. Visit flipkart.com`,
    },
    {
      address: "VK-SWIGGY",
      body: `Swiggy: Hungry? Get free delivery on orders above Rs.199 today. Order now!`,
    },
    {
      address: "VM-CRED",
      body: `CRED: Pay your credit card bill and earn rewards. Pay now on CRED app.`,
    },
  ];
  const p = pick(promos);
  return { ...p, expected: { isPayment: false } };
}

function makePersonal(d) {
  const texts = [
    { address: "+919876543210", body: "Hey, are we still on for dinner tonight?" },
    { address: "+919123456789", body: "Call me when free. Need to discuss the project." },
    { address: "+918765432109", body: "Happy birthday! Hope you have a great day 🎂" },
    { address: "+917890123456", body: "Meeting moved to 4pm. See you there." },
    { address: "+919988776655", body: "Can you send me the docs when you get a chance?" },
  ];
  const t = pick(texts);
  return { ...t, expected: { isPayment: false } };
}

function makeFailedTxn(d, merchant, amount) {
  const bank = pick(BANKS);
  const upiRef = nextUpiRef();
  const body = `${bank.label}: UPI payment of Rs.${fmtAmt(amount)} to ${merchant.vpa} on ${fmtDateDDMMYY(d)} FAILED. UPI Ref ${upiRef}. Money will be refunded if debited.`;
  return {
    address: bank.address,
    body,
    expected: {
      isPayment: true,
      amount: fmtAmt(amount),
      direction: "debit",
      merchantHint: merchant.name,
      source: "sms",
      status: "failed",
      upiRef,
    },
  };
}

// ─── Day simulation ──────────────────────────────────────────────────────────

const DEBIT_MAKERS = [
  makeHdfcDebit,
  makeSbiDebit,
  makeIciciDebit,
  makeAxisDebit,
  makePhonePe,
  makeGpay,
];

function randomTimeOnDay(dayStart) {
  // Prefer daytime + evening spend peaks
  const hourBuckets = [
    [8, 10],
    [11, 14],
    [17, 21],
    [21, 23],
  ];
  const [h0, h1] = pick(hourBuckets);
  const hour = randInt(h0, h1);
  const min = randInt(0, 59);
  const sec = randInt(0, 59);
  return new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    hour,
    min,
    sec
  );
}

function generateDay(dayStart, dayIndex) {
  const msgs = [];
  const dow = dayStart.getDay(); // 0 Sun
  const isWeekend = dow === 0 || dow === 6;

  // Payment volume: more on weekends, ~1-4/day
  let paymentCount = isWeekend ? randInt(2, 5) : randInt(0, 3);
  // Some quiet weekdays
  if (!isWeekend && chance(0.25)) paymentCount = 0;
  // Occasional heavy day
  if (chance(0.08)) paymentCount += randInt(2, 4);

  for (let i = 0; i < paymentCount; i++) {
    const when = randomTimeOnDay(dayStart);
    const upiRef = nextUpiRef();
    const maker = pick(DEBIT_MAKERS);

    if (maker === makeGpay && chance(0.45)) {
      const person = pick(PEOPLE);
      const amount = pick([50, 100, 200, 300, 500, 1000, 1500, 2000]);
      const m = makeGpay(when, person, amount, upiRef);
      msgs.push({ ...m, dateMs: when.getTime() });
    } else {
      const merchant = pick(MERCHANTS);
      const amount = pick(merchant.amounts);
      // GPay with merchant name
      if (maker === makeGpay) {
        const m = makeGpay(when, merchant, amount, upiRef);
        msgs.push({ ...m, dateMs: when.getTime() });
      } else {
        const m = maker(when, merchant, amount, upiRef);
        msgs.push({ ...m, dateMs: when.getTime() });
      }
    }
  }

  // Peer credits: ~every few days
  if (chance(0.18)) {
    const when = randomTimeOnDay(dayStart);
    const person = pick(PEOPLE);
    const amount = pick([100, 200, 500, 800, 1000, 2000, 5000]);
    const m = makeCredit(when, person, amount, nextUpiRef());
    msgs.push({ ...m, dateMs: when.getTime() });
  }

  // Monthly salary around day 1 or 28-31
  const dom = dayStart.getDate();
  if ((dom === 1 || dom === 28) && chance(0.85)) {
    const when = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate(),
      9,
      randInt(0, 40),
      0
    );
    const salary = 65000 + randInt(-2000, 5000);
    const m = makeSalaryCredit(when, salary);
    msgs.push({ ...m, dateMs: when.getTime() });
  }

  // ATM: occasional
  if (chance(0.06)) {
    const when = randomTimeOnDay(dayStart);
    const m = makeAtmWithdraw(when, pick([2000, 5000, 10000]));
    msgs.push({ ...m, dateMs: when.getTime() });
  }

  // Failed txn: rare
  if (chance(0.04)) {
    const when = randomTimeOnDay(dayStart);
    const merchant = pick(MERCHANTS);
    const m = makeFailedTxn(when, merchant, pick(merchant.amounts));
    msgs.push({ ...m, dateMs: when.getTime() });
  }

  // Noise: OTP, promo, personal
  if (chance(0.35)) {
    const when = randomTimeOnDay(dayStart);
    const m = makeOtp(when);
    msgs.push({ ...m, dateMs: when.getTime() });
  }
  if (chance(0.2)) {
    const when = randomTimeOnDay(dayStart);
    const m = makePromo(when);
    msgs.push({ ...m, dateMs: when.getTime() });
  }
  if (chance(0.4)) {
    const when = randomTimeOnDay(dayStart);
    const m = makePersonal(when);
    msgs.push({ ...m, dateMs: when.getTime() });
  }
  // Extra personal traffic some days
  if (chance(0.15)) {
    const when = randomTimeOnDay(dayStart);
    const m = makePersonal(when);
    msgs.push({ ...m, dateMs: when.getTime() });
  }

  return msgs;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  // Inclusive lookback: today and previous (DAYS-1) days
  const start = new Date(end);
  start.setDate(start.getDate() - (DAYS - 1));
  start.setHours(0, 0, 0, 0);

  /** @type {Array<{address:string,body:string,dateMs:number,expected:object}>} */
  const messages = [];

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    messages.push(...generateDay(day, i));
  }

  // Sort oldest → newest (inject order); app sorts newest first
  messages.sort((a, b) => a.dateMs - b.dateMs);

  // Assign stable ids
  const withIds = messages.map((m, idx) => ({
    id: `fake-${String(idx + 1).padStart(5, "0")}`,
    address: m.address,
    body: m.body,
    dateMs: m.dateMs,
    dateIso: new Date(m.dateMs).toISOString(),
    expected: m.expected,
  }));

  const paymentCount = withIds.filter((m) => m.expected?.isPayment).length;
  const noiseCount = withIds.length - paymentCount;

  const fixture = {
    meta: {
      generatedAt: new Date().toISOString(),
      seed: SEED,
      days: DAYS,
      range: {
        from: start.toISOString(),
        to: end.toISOString(),
      },
      counts: {
        total: withIds.length,
        paymentLike: paymentCount,
        noise: noiseCount,
      },
      note:
        "Fake SMS for testing Spentd read/parse. Inject with inject-sms-emulator.mjs. Verify with verify-sms-parse.mjs.",
    },
    messages: withIds,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(fixture, null, 2));

  console.log(`Wrote ${withIds.length} messages → ${OUT}`);
  console.log(
    `  payment-like: ${paymentCount}, noise: ${noiseCount}, days: ${DAYS}`
  );
  console.log(
    `  range: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`
  );
}

main();
