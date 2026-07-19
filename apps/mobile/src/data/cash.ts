import { Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createExpense } from "./expenses";

const KEY = "spentd.wallets";
const MAX_MOVEMENTS = 100;

export type WalletId = "account" | "cash";
export type WalletMoveType = "add" | "deduct";

export type WalletMovement = {
  id: string;
  wallet: WalletId;
  type: WalletMoveType;
  amount: number;
  note: string | null;
  expenseId: string | null;
  createdAt: string;
};

export type WalletsState = {
  accountBalance: number;
  cashBalance: number;
  movements: WalletMovement[];
};

const EMPTY: WalletsState = {
  accountBalance: 0,
  cashBalance: 0,
  movements: [],
};

async function getRaw(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

async function setRaw(value: string) {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function deleteRaw() {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

function clampMoney(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function parseAmount(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  return clampMoney(raw);
}

function normalize(raw: unknown): WalletsState {
  if (!raw || typeof raw !== "object") return { ...EMPTY, movements: [] };
  const o = raw as Record<string, unknown>;
  const movements = Array.isArray(o.movements)
    ? o.movements
        .filter((m): m is WalletMovement => {
          if (!m || typeof m !== "object") return false;
          const x = m as WalletMovement;
          return (
            (x.wallet === "account" || x.wallet === "cash") &&
            (x.type === "add" || x.type === "deduct") &&
            typeof x.amount === "number" &&
            typeof x.id === "string" &&
            typeof x.createdAt === "string"
          );
        })
        .map((m) => ({
          id: m.id,
          wallet: m.wallet,
          type: m.type,
          amount: clampMoney(m.amount),
          note: typeof m.note === "string" ? m.note : null,
          expenseId: typeof m.expenseId === "string" ? m.expenseId : null,
          createdAt: m.createdAt,
        }))
    : [];

  return {
    accountBalance: clampMoney(Number(o.accountBalance) || 0),
    cashBalance: clampMoney(Number(o.cashBalance) || 0),
    movements,
  };
}

async function save(state: WalletsState): Promise<WalletsState> {
  const next: WalletsState = {
    accountBalance: clampMoney(state.accountBalance),
    cashBalance: clampMoney(state.cashBalance),
    movements: state.movements.slice(0, MAX_MOVEMENTS),
  };
  await setRaw(JSON.stringify(next));
  return next;
}

export async function getWallets(): Promise<WalletsState> {
  try {
    const raw = await getRaw();
    if (!raw) return { ...EMPTY, movements: [] };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...EMPTY, movements: [] };
  }
}

export async function clearWallets(): Promise<void> {
  await deleteRaw();
}

function balanceOf(state: WalletsState, wallet: WalletId): number {
  return wallet === "account" ? state.accountBalance : state.cashBalance;
}

function withBalance(
  state: WalletsState,
  wallet: WalletId,
  amount: number
): WalletsState {
  if (wallet === "account") {
    return { ...state, accountBalance: clampMoney(amount) };
  }
  return { ...state, cashBalance: clampMoney(amount) };
}

function pushMove(
  state: WalletsState,
  move: WalletMovement
): WalletsState {
  return {
    ...state,
    movements: [move, ...state.movements].slice(0, MAX_MOVEMENTS),
  };
}

export async function addToWallet(
  wallet: WalletId,
  amountRaw: number,
  note?: string | null
): Promise<WalletsState> {
  const amount = parseAmount(amountRaw);
  const state = await getWallets();
  const nextBal = balanceOf(state, wallet) + amount;
  const move: WalletMovement = {
    id: randomUUID(),
    wallet,
    type: "add",
    amount,
    note: note?.trim() || null,
    expenseId: null,
    createdAt: new Date().toISOString(),
  };
  return save(pushMove(withBalance(state, wallet, nextBal), move));
}

export type DeductOpts = {
  note?: string | null;
  /** Cash only: also create a spending expense (default true for cash). */
  logExpense?: boolean;
  merchant?: string;
  categoryId?: string | null;
};

/**
 * Deduct from a wallet. For cash, logExpense defaults to true so the spend
 * counts toward monthly spending / budget.
 */
export async function deductFromWallet(
  wallet: WalletId,
  amountRaw: number,
  opts: DeductOpts = {}
): Promise<WalletsState> {
  const amount = parseAmount(amountRaw);
  const state = await getWallets();
  const current = balanceOf(state, wallet);
  if (amount > current + 1e-9) {
    throw new Error(
      wallet === "cash"
        ? "Not enough cash in hand."
        : "Not enough balance in account."
    );
  }

  const logExpense =
    wallet === "cash" ? opts.logExpense !== false : opts.logExpense === true;

  let expenseId: string | null = null;
  if (logExpense) {
    const merchant =
      opts.merchant?.trim() ||
      opts.note?.trim() ||
      (wallet === "cash" ? "Cash" : "Account");
    const { expense } = await createExpense({
      amount: amount.toFixed(2),
      currency: "INR",
      direction: "debit",
      merchant,
      categoryId: opts.categoryId ?? null,
      paidAt: new Date().toISOString(),
      source: wallet === "cash" ? "cash" : "manual",
      notes: opts.note?.trim() || null,
    });
    expenseId = expense.id;
  }

  const move: WalletMovement = {
    id: randomUUID(),
    wallet,
    type: "deduct",
    amount,
    note: opts.note?.trim() || null,
    expenseId,
    createdAt: new Date().toISOString(),
  };

  return save(
    pushMove(withBalance(state, wallet, current - amount), move)
  );
}

export function totalLiquid(state: WalletsState): number {
  return clampMoney(state.accountBalance + state.cashBalance);
}

export function movementsFor(
  state: WalletsState,
  wallet: WalletId,
  limit = 20
): WalletMovement[] {
  return state.movements.filter((m) => m.wallet === wallet).slice(0, limit);
}
