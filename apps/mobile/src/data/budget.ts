import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "spentd.monthly_budget";
const DEFAULT_BUDGET = 60000;

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

export async function getMonthlyBudget(): Promise<number> {
  const v = await getRaw();
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUDGET;
  return n;
}

export async function setMonthlyBudget(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await setRaw(String(Math.round(amount)));
}

export { DEFAULT_BUDGET };
