import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const USERNAME_KEY = "paymenttracker.last_username";

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

/** Remember username only — never store the passcode. */
export async function saveLastUsername(username: string) {
  await setItem(USERNAME_KEY, username);
}

export async function getLastUsername(): Promise<string | null> {
  return getItem(USERNAME_KEY);
}

export async function clearLastUsername() {
  await deleteItem(USERNAME_KEY);
}
