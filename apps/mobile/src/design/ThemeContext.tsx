import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import {
  type ColorTokens,
  darkColors,
  lightColors,
  type ThemeMode,
} from "./tokens";

const STORAGE_KEY = "paymenttracker.theme";

type ThemePreference = "system" | ThemeMode;

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  colors: ColorTokens;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function persistPreference(p: ThemePreference) {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, p);
  } catch {
    /* web / unavailable */
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }
}

async function readPreference(): Promise<ThemePreference | null> {
  try {
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    try {
      if (typeof localStorage !== "undefined") {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "light" || v === "dark" || v === "system") return v;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    readPreference().then((p) => {
      if (p) setPreferenceState(p);
      setReady(true);
    });
  }, []);

  const mode: ThemeMode =
    preference === "system"
      ? system === "light"
        ? "light"
        : "dark"
      : preference;

  const colors = mode === "light" ? lightColors : darkColors;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    void persistPreference(p);
  }, []);

  const toggle = useCallback(() => {
    setPreferenceState((prev) => {
      const current =
        prev === "system" ? (system === "light" ? "light" : "dark") : prev;
      const next: ThemeMode = current === "dark" ? "light" : "dark";
      void persistPreference(next);
      return next;
    });
  }, [system]);

  const value = useMemo(
    () => ({
      mode,
      preference,
      colors,
      isDark: mode === "dark",
      setPreference,
      toggle,
    }),
    [mode, preference, colors, setPreference, toggle],
  );

  // Avoid flash of wrong theme after reading storage
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
