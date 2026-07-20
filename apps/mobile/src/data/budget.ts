import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "spentd.monthly_budget";
const PREFS_KEY = "spentd.budget_prefs";
const DEFAULT_BUDGET = 60000;
const DEFAULT_SAVINGS_RATE = 0.25;
const SPEND_AVG_BUFFER = 1.05;

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
  /** true when viewing the current calendar month */
  isCurrentMonth: boolean;
  source: BudgetSource;
  savingsRate: number;
  mode: BudgetMode;
  /** credit − debit for the month */
  net: number;
  /** Income figure used for auto budget (may be avg fallback) */
  effectiveIncome: number;
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
 * Pure hybrid budget calculator.
 * - manual: fixed manualBudget
 * - auto from income: income * (1 - savingsRate)
 * - auto fallback: avg last-3 spend * buffer
 * - last resort: DEFAULT_BUDGET
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

  if (input.prefs.mode === "manual") {
    budget = clampBudget(input.prefs.manualBudget);
    source = "manual";
    effectiveIncome = incomeThis || avgIncome;
  } else {
    const incomeBase = incomeThis > 0 ? incomeThis : avgIncome;
    if (incomeBase > 0) {
      effectiveIncome = incomeBase;
      budget = Math.max(0, Math.round(incomeBase * (1 - savingsRate)));
      source = "income";
      if (budget <= 0) {
        // Extreme savings rate — still show a floor from spend avg or default
        if (avgSpend > 0) {
          budget = Math.round(avgSpend * SPEND_AVG_BUFFER);
          source = "spend-avg";
        } else {
          budget = DEFAULT_BUDGET;
          source = "default";
        }
      }
    } else if (avgSpend > 0) {
      budget = Math.round(avgSpend * SPEND_AVG_BUFFER);
      source = "spend-avg";
    } else {
      budget = DEFAULT_BUDGET;
      source = "default";
    }
  }

  const remaining = budget - spent;
  const dailyAllowance = Math.max(0, remaining / daysLeft);

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
    isCurrentMonth,
    source,
    savingsRate,
    mode: input.prefs.mode,
    net,
    effectiveIncome,
    daysLeft,
    dayOfMonth,
    daysInMonth: dim,
  };
}

export { DEFAULT_BUDGET, DEFAULT_SAVINGS_RATE };
