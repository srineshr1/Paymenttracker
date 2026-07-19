import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { UserPublic } from "@paymenttracker/shared";
import { api, configureApi } from "@/src/api/client";
import { lockLocal } from "@/src/data/localAuth";
import { clearActiveDek } from "@/src/data/crypto";
import { getDb } from "@/src/data/db";
import { getLastUsername, saveLastUsername } from "@/src/lib/secure";
import { markSmsConsentPending } from "@/src/features/sms/prefs";

const LOCK_AFTER_MS = 5 * 60 * 1000;

type AuthState = {
  user: UserPublic | null;
  token: string | null;
  ready: boolean;
  /** True when a local account exists — login only needs passcode. */
  hasAccount: boolean;
  rememberedUsername: string | null;
  /** Passcode-only unlock (preferred after first registration). */
  unlock: (passcode: string) => Promise<void>;
  login: (username: string, passcode: string) => Promise<void>;
  register: (username: string, passcode: string) => Promise<void>;
  changePasscode: (
    currentPasscode: string,
    newPasscode: string
  ) => Promise<void>;
  updateUsername: (username: string, passcode: string) => Promise<void>;
  /** Device auth, then new passcode — keeps spending history. */
  recoverResetPasscode: (newPasscode: string) => Promise<void>;
  /** Device auth, wipe expenses, new passcode — keeps username. */
  recoverClearHistory: (newPasscode: string) => Promise<void>;
  /** Device auth, wipe everything — back to create account. */
  recoverClearAll: () => Promise<void>;
  logout: () => void;
  lock: () => void;
  refreshAccountState: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [rememberedUsername, setRememberedUsername] = useState<string | null>(
    null
  );
  const tokenRef = useRef<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    configureApi({
      tokenGetter: () => tokenRef.current,
    });
  }, []);

  const refreshAccountState = useCallback(async () => {
    try {
      await getDb();
      const exists = await api.hasAccount();
      setHasAccount(exists);
    } catch {
      setHasAccount(false);
    }
    const name = await getLastUsername();
    setRememberedUsername(name);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        const exists = await api.hasAccount();
        setHasAccount(exists);
      } catch {
        setHasAccount(false);
      }
      const name = await getLastUsername();
      setRememberedUsername(name);
      // Passcode is never restored — session starts locked.
      setReady(true);
    })();
  }, []);

  const applySession = useCallback(
    async (nextToken: string, nextUser: UserPublic) => {
      tokenRef.current = nextToken;
      setToken(nextToken);
      setUser(nextUser);
      setHasAccount(true);
      setRememberedUsername(nextUser.username);
      await saveLastUsername(nextUser.username);
    },
    []
  );

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    lockLocal();
    clearActiveDek();
  }, []);

  const unlock = useCallback(
    async (passcode: string) => {
      const res = await api.unlock(passcode);
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const login = useCallback(
    async (username: string, passcode: string) => {
      const res = await api.login(username, passcode);
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const register = useCallback(
    async (username: string, passcode: string) => {
      const res = await api.register(username, passcode);
      await markSmsConsentPending();
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const changePasscode = useCallback(
    async (currentPasscode: string, newPasscode: string) => {
      await api.changePasscode(currentPasscode, newPasscode);
    },
    []
  );

  const updateUsername = useCallback(
    async (username: string, passcode: string) => {
      const res = await api.updateUsername(username, passcode);
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const recoverResetPasscode = useCallback(
    async (newPasscode: string) => {
      await api.verifyDevice();
      const res = await api.resetPasscodeRecovery(newPasscode);
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const recoverClearHistory = useCallback(
    async (newPasscode: string) => {
      await api.verifyDevice();
      const res = await api.clearHistoryRecovery(newPasscode);
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  /** Full wipe after phone lock / biometrics verification. */
  const recoverClearAll = useCallback(async () => {
    await api.verifyDevice();
    await api.clearAllDataRecovery();
    clearSession();
    setHasAccount(false);
    setRememberedUsername(null);
  }, [clearSession]);

  const logout = useCallback(() => {
    // Keep the local account; just lock until passcode is entered again.
    clearSession();
  }, [clearSession]);

  const lock = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        backgroundedAt.current = Date.now();
      }
      if (state === "active" && backgroundedAt.current != null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed >= LOCK_AFTER_MS && tokenRef.current) {
          clearSession();
        }
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      hasAccount,
      rememberedUsername,
      unlock,
      login,
      register,
      changePasscode,
      updateUsername,
      recoverResetPasscode,
      recoverClearHistory,
      recoverClearAll,
      logout,
      lock,
      refreshAccountState,
    }),
    [
      user,
      token,
      ready,
      hasAccount,
      rememberedUsername,
      unlock,
      login,
      register,
      changePasscode,
      updateUsername,
      recoverResetPasscode,
      recoverClearHistory,
      recoverClearAll,
      logout,
      lock,
      refreshAccountState,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
