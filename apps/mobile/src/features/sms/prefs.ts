import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "spentd.sms.auto_import";
/** Set after account create; cleared when user answers Agree / Disagree. */
const PENDING_KEY = "spentd.sms.consent_pending";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
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

async function deleteItem(key: string) {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Whether live SMS auto-import is enabled (user preference). */
export async function getSmsAutoImportEnabled(): Promise<boolean> {
  const v = await getItem(KEY);
  return v === "1";
}

export async function setSmsAutoImportEnabled(enabled: boolean): Promise<void> {
  await setItem(KEY, enabled ? "1" : "0");
}

/** Call right after a new account is created. */
export async function markSmsConsentPending(): Promise<void> {
  await setItem(PENDING_KEY, "1");
}

export async function isSmsConsentPending(): Promise<boolean> {
  const v = await getItem(PENDING_KEY);
  return v === "1";
}

export async function clearSmsConsentPending(): Promise<void> {
  await deleteItem(PENDING_KEY);
}
