import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "spentd.sms.auto_import";

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

/** Whether live SMS auto-import is enabled (user preference). */
export async function getSmsAutoImportEnabled(): Promise<boolean> {
  const v = await getItem(KEY);
  // Default on for Android once the user has tried SMS once? Safer default: off
  // until they enable it — privacy. But user asked for autonomous: default on
  // after first permission grant is handled in UI; store explicit value.
  return v === "1";
}

export async function setSmsAutoImportEnabled(enabled: boolean): Promise<void> {
  await setItem(KEY, enabled ? "1" : "0");
}
