import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "spentd.monthly_budget";
const PREFS_KEY = "spentd.budget_prefs";
const DEFAULT_BUDGET = 60000;
const DEFAULT_SAVINGS_RATE = 0.25;
const SPEND_AVG_BUFFER = 1.05;
/**
 * If detected income is below this fraction of typical spend (or already-spent),
 * treat SMS credits as incomplete and do not use them alone.
 */
const INCOME_VS_SPEND_MIN = 0.4;
/** This-month income must be at least this fraction of 3-mo avg to trust it over the avg. */
const INCOME_VS_AVG_MIN = 0.7;

export type BudgetMode = "auto" | "manual";

export type BudgetPrefs = {
  mode: BudgetMode;
  /** Used when mode is manual */
  manualBudget: number;
  /** 0–0.9 — portion of income to keep, not spend */
  savingsRate: number;
};

export type BudgetSource = "income" | "spend-avg" | "manual" | "default";

export type BudgetPlan = {
  budget: number;
  remaining: number;
  dailyAllowance: number;
  /** Positive = overspending vs linear pace; negative = under pace */
  paceDeltaPct: number | null;
  /** Absolute ₹ over budget (spent − budget), only when spent > budget */
  overBy: number;
  /** true when viewing the current calendar month */
  isCurrentMonth: boolean;
  source: BudgetSource;
  savingsRate: number;
  mode: BudgetMode;
  /** credit − debit for the month */
  net: number;
  /** Income figure used for auto budget (may be avg fallback) */
  effectiveIncome: number;
  /** True when this-month credits look too low vs spend / history */
  incomeIncomplete: boolean;
  daysLeft: number;
  dayOfMonth: number;
  daysInMonth: number;
};

const DEFAULT_PREFS: BudgetPrefs = {
  mode: "auto",
  manualBudget: DEFAULT_BUDGET,
  savingsRate: DEFAULT_SAVINGS_RATE,
};

async function getRaw(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setRaw(key: string, value: string) {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

function clampSavingsRate(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SAVINGS_RATE;
  return Math.min(0.9, Math.max(0, n));
}

function clampBudget(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUDGET;
  return Math.round(n);
}

/** Load prefs; migrates legacy plain-number budget key. */
export async function getBudgetPrefs(): Promise<BudgetPrefs> {
  const raw = await getRaw(PREFS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<BudgetPrefs>;
      return {
        mode: parsed.mode === "manual" ? "manual" : "auto",
        manualBudget: clampBudget(
          Number(parsed.manualBudget) || DEFAULT_BUDGET,
        ),
        savingsRate: clampSavingsRate(
          Number(parsed.savingsRate) ?? DEFAULT_SAVINGS_RATE,
        ),
      };
    } catch {
      /* fall through */
    }
  }

  // Legacy: single number under KEY → treat as manual budget
  const legacy = await getRaw(KEY);
  if (legacy) {
    const n = Number(legacy);
    if (Number.isFinite(n) && n > 0) {
      const prefs: BudgetPrefs = {
        mode: "manual",
        manualBudget: Math.round(n),
        savingsRate: DEFAULT_SAVINGS_RATE,
      };
      await setBudgetPrefs(prefs);
      return prefs;
    }
  }

  return { ...DEFAULT_PREFS };
}

export async function setBudgetPrefs(
  prefs: Partial<BudgetPrefs>,
): Promise<BudgetPrefs> {
  const current = await getBudgetPrefs();
  const next: BudgetPrefs = {
    mode:
      prefs.mode === "manual" || prefs.mode === "auto"
        ? prefs.mode
        : current.mode,
    manualBudget:
      prefs.manualBudget != null
        ? clampBudget(prefs.manualBudget)
        : current.manualBudget,
    savingsRate:
      prefs.savingsRate != null
        ? clampSavingsRate(prefs.savingsRate)
        : current.savingsRate,
  };
  await setRaw(PREFS_KEY, JSON.stringify(next));
  // Keep legacy key in sync for any old readers
  await setRaw(KEY, String(next.manualBudget));
  return next;
}

/** @deprecated Prefer getBudgetPrefs + computeBudgetPlan */
export async function getMonthlyBudget(): Promise<number> {
  const prefs = await getBudgetPrefs();
  if (prefs.mode === "manual") return prefs.manualBudget;
  return DEFAULT_BUDGET;
}

/** @deprecated Prefer setBudgetPrefs */
export async function setMonthlyBudget(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await setBudgetPrefs({ mode: "manual", manualBudget: Math.round(amount) });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Choose an income base for smart budget.
 *
 * SMS imports often miss salary credits, so a lone small credit (e.g. ₹1,000)
 * must not collapse the monthly budget to ₹900 when the user already spent ₹20k+.
 */
export function pickIncomeBase(input: {
  incomeThisMonth: number;
  avgIncomeLast3: number;
  avgSpendLast3: number;
  spentThisMonth: number;
  isCurrentMonth: boolean;
}): { income: number; incomplete: boolean } {
  const incomeThis = Math.max(0, Number(input.incomeThisMonth) || 0);
  const avgIncome = Math.max(0, Number(input.avgIncomeLast3) || 0);
  const avgSpend = Math.max(0, Number(input.avgSpendLast3) || 0);
  const spent = Math.max(0, Number(input.spentThisMonth) || 0);

  if (incomeThis <= 0 && avgIncome <= 0) {
    return { income: 0, incomplete: true };
  }

  // Stronger of this month vs rolling avg — partial months / late salary
  let income = Math.max(incomeThis, avgIncome);

  // Mid current month: salary often not credited yet — trust avg when this month is low
  if (
    input.isCurrentMonth &&
    avgIncome > 0 &&
    incomeThis > 0 &&
    incomeThis < avgIncome * INCOME_VS_AVG_MIN
  ) {
    income = avgIncome;
  }

  // Credits look incomplete if they can't plausibly fund typical or already-observed spend
  const spendRef = Math.max(avgSpend, spent);
  if (income > 0 && spendRef > 0 && income < spendRef * INCOME_VS_SPEND_MIN) {
    if (avgIncome >= spendRef * INCOME_VS_SPEND_MIN) {
      return { income: avgIncome, incomplete: false };
    }
    // No trustworthy income signal — caller falls back to spend-avg / default
    return { income: 0, incomplete: true };
  }

  return { income, incomplete: false };
}

/**
 * Pure hybrid budget calculator.
 * - manual: fixed manualBudget
 * - auto from income: effectiveIncome * (1 - savingsRate)
 * - auto fallback: avg last-3 spend * buffer * (1 - savingsRate)
 * - last resort: DEFAULT_BUDGET (when credits look incomplete or empty)
 */
export function computeBudgetPlan(input: {
  incomeThisMonth: number;
  avgIncomeLast3: number;
  avgSpendLast3: number;
  spentThisMonth: number;
  year: number;
  month: number;
  today?: Date;
  prefs: BudgetPrefs;
}): BudgetPlan {
  const today = input.today ?? new Date();
  const dim = daysInMonth(input.year, input.month);
  const isCurrentMonth =
    today.getFullYear() === input.year && today.getMonth() + 1 === input.month;
  const dayOfMonth = isCurrentMonth
    ? Math.min(dim, Math.max(1, today.getDate()))
    : dim;
  const daysLeft = isCurrentMonth ? Math.max(1, dim - dayOfMonth + 1) : 1;

  const incomeThis = Math.max(0, Number(input.incomeThisMonth) || 0);
  const avgIncome = Math.max(0, Number(input.avgIncomeLast3) || 0);
  const avgSpend = Math.max(0, Number(input.avgSpendLast3) || 0);
  const spent = Math.max(0, Number(input.spentThisMonth) || 0);
  const savingsRate = clampSavingsRate(input.prefs.savingsRate);

  let budget: number;
  let source: BudgetSource;
  let effectiveIncome = 0;
  let incomeIncomplete = false;

  if (input.prefs.mode === "manual") {
    budget = clampBudget(input.prefs.manualBudget);
    source = "manual";
    effectiveIncome = Math.max(incomeThis, avgIncome);
  } else {
    const picked = pickIncomeBase({
      incomeThisMonth: incomeThis,
      avgIncomeLast3: avgIncome,
      avgSpendLast3: avgSpend,
      spentThisMonth: spent,
      isCurrentMonth,
    });
    incomeIncomplete = picked.incomplete;
    const incomeBase = picked.income;

    if (incomeBase > 0) {
      effectiveIncome = incomeBase;
      budget = Math.max(0, Math.round(incomeBase * (1 - savingsRate)));
      source = "income";

      // Floor: income-based budget must not be absurdly below typical spend
      if (avgSpend > 0 && budget < avgSpend * 0.5) {
        budget = Math.round(avgSpend * SPEND_AVG_BUFFER * (1 - savingsRate));
        source = "spend-avg";
        incomeIncomplete = true;
      }
    } else if (avgSpend > 0) {
      // Apply savings rate to spend-based plan so "save 10%" still means something
      budget = Math.round(avgSpend * SPEND_AVG_BUFFER * (1 - savingsRate));
      source = "spend-avg";
      effectiveIncome = avgIncome;
    } else {
      // No history and untrustworthy credits (e.g. ₹1k income, ₹22k spend)
      budget = DEFAULT_BUDGET;
      source = "default";
      effectiveIncome = incomeThis;
      incomeIncomplete = incomeThis > 0 || incomeIncomplete;
    }

    if (budget <= 0) {
      if (avgSpend > 0) {
        budget = Math.round(avgSpend * SPEND_AVG_BUFFER);
        source = "spend-avg";
      } else {
        budget = DEFAULT_BUDGET;
        source = "default";
      }
    }
  }

  const remaining = budget - spent;
  const dailyAllowance = Math.max(0, remaining / daysLeft);
  const overBy = Math.max(0, Math.round(spent - budget));

  let paceDeltaPct: number | null = null;
  if (budget > 0 && isCurrentMonth) {
    const expectedByToday = budget * (dayOfMonth / dim);
    if (expectedByToday > 0) {
      paceDeltaPct = Math.round(
        ((spent - expectedByToday) / expectedByToday) * 100,
      );
    } else {
      paceDeltaPct = spent > 0 ? 100 : 0;
    }
  } else if (budget > 0 && !isCurrentMonth) {
    // Final over/under vs full budget
    paceDeltaPct = Math.round(((spent - budget) / budget) * 100);
  }

  const received = incomeThis;
  const net = received - spent;

  return {
    budget,
    remaining,
    dailyAllowance,
    paceDeltaPct,
    overBy,
    isCurrentMonth,
    source,
    savingsRate,
    mode: input.prefs.mode,
    net,
    effectiveIncome,
    incomeIncomplete,
    daysLeft,
    dayOfMonth,
    daysInMonth: dim,
  };
}

export { DEFAULT_BUDGET, DEFAULT_SAVINGS_RATE };
