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
import { api, configureApi, ensureApiReachable } from "@/src/api/client";
import { getLastUsername, saveLastUsername } from "@/src/lib/secure";

const LOCK_AFTER_MS = 5 * 60 * 1000;

type AuthState = {
  user: UserPublic | null;
  token: string | null;
  ready: boolean;
  rememberedUsername: string | null;
  login: (username: string, passcode: string) => Promise<void>;
  register: (username: string, passcode: string) => Promise<void>;
  logout: () => void;
  lock: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
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

  useEffect(() => {
    (async () => {
      const name = await getLastUsername();
      setRememberedUsername(name);
      // Find a working API base (10.0.2.2 / 127.0.0.1 / env)
      try {
        await ensureApiReachable();
      } catch {
        // Login screen will surface the error on submit
      }
      // Passcode is never restored — session starts locked.
      setReady(true);
    })();
  }, []);

  const applySession = useCallback(
    async (nextToken: string, nextUser: UserPublic) => {
      tokenRef.current = nextToken;
      setToken(nextToken);
      setUser(nextUser);
      setRememberedUsername(nextUser.username);
      await saveLastUsername(nextUser.username);
    },
    []
  );

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

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
      await applySession(res.token, res.user);
    },
    [applySession]
  );

  const logout = useCallback(() => {
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
      rememberedUsername,
      login,
      register,
      logout,
      lock,
    }),
    [
      user,
      token,
      ready,
      rememberedUsername,
      login,
      register,
      logout,
      lock,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
