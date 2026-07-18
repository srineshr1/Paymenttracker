import { Platform } from "react-native";
import type {
  AuthResponse,
  Category,
  Expense,
  MonthSummary,
  UserPublic,
} from "@paymenttracker/shared";

/**
 * Candidate API bases for Android emulator / device.
 * We probe /health and stick to the first that responds.
 */
function candidateBases(): string[] {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  const list: string[] = [];

  if (Platform.OS === "web") {
    if (fromEnv && !fromEnv.includes("10.0.2.2")) list.push(fromEnv);
    list.push("http://localhost:3001", "http://127.0.0.1:3001");
    return [...new Set(list)];
  }

  if (Platform.OS === "android") {
    // Order matters: classic emulator host, then adb reverse, then env
    list.push(
      "http://10.0.2.2:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3001"
    );
    if (fromEnv) list.unshift(fromEnv);
    return [...new Set(list)];
  }

  if (fromEnv) list.push(fromEnv);
  list.push("http://localhost:3001", "http://127.0.0.1:3001");
  return [...new Set(list)];
}

type TokenGetter = () => string | null;

let getToken: TokenGetter = () => null;
let apiBase = candidateBases()[0] ?? "http://10.0.2.2:3001";
let probePromise: Promise<string> | null = null;

export function configureApi(opts: {
  baseUrl?: string;
  tokenGetter: TokenGetter;
}) {
  if (opts.baseUrl) apiBase = opts.baseUrl.replace(/\/$/, "");
  getToken = opts.tokenGetter;
}

export function getApiBase() {
  return apiBase;
}

export function setApiBase(url: string) {
  apiBase = url.replace(/\/$/, "");
}

/** Find a reachable API among candidates (call on app start / before login). */
export async function ensureApiReachable(): Promise<string> {
  if (probePromise) return probePromise;

  probePromise = (async () => {
    const bases = candidateBases();
    // Prefer current base first
    const ordered = [apiBase, ...bases.filter((b) => b !== apiBase)];
    const errors: string[] = [];

    for (const base of ordered) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(`${base}/health`, {
          method: "GET",
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res.ok) {
          apiBase = base;
          return base;
        }
        errors.push(`${base} → HTTP ${res.status}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${base} → ${msg}`);
      }
    }

    probePromise = null;
    throw new Error(
      `Cannot reach API. Tried:\n${errors.join("\n")}\n\nKeep "npm run api" running. On emulator also run:\nadb reverse tcp:3001 tcp:3001`
    );
  })();

  try {
    return await probePromise;
  } catch (e) {
    probePromise = null;
    throw e;
  }
}

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function friendlyNetworkError(err: unknown): Error {
  if (err instanceof Error && err.message.startsWith("Cannot reach API")) {
    return err;
  }
  const base = getApiBase();
  const hint =
    Platform.OS === "android"
      ? `Cannot reach API at ${base}. Keep "npm run api" running, then on your PC run:\nadb reverse tcp:3001 tcp:3001\nand reload the app.`
      : `Cannot reach API at ${base}. Start the API with: npm run api`;
  const wrapped = new Error(hint);
  wrapped.name = "NetworkError";
  wrapped.cause = err;
  return wrapped;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true
): Promise<T> {
  // Before first real request, try to lock onto a working base
  if (path !== "/health") {
    try {
      await ensureApiReachable();
    } catch (e) {
      throw friendlyNetworkError(e);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string>),
  };

  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers["Content-Type"] && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, { ...init, headers });
  } catch (err) {
    // One more probe + retry once
    probePromise = null;
    try {
      await ensureApiReachable();
      res = await fetch(`${apiBase}${path}`, { ...init, headers });
    } catch (err2) {
      throw friendlyNetworkError(err2);
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export const api = {
  register(username: string, passcode: string) {
    return request<AuthResponse>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ username, passcode }),
      },
      false
    );
  },

  login(username: string, passcode: string) {
    return request<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, passcode }),
      },
      false
    );
  },

  me() {
    return request<{ user: UserPublic }>("/auth/me");
  },

  listExpenses(params?: {
    from?: string;
    to?: string;
    q?: string;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<{ expenses: Expense[] }>(
      `/expenses${q ? `?${q}` : ""}`
    );
  },

  monthSummary(year?: number, month?: number) {
    const qs = new URLSearchParams();
    if (year) qs.set("year", String(year));
    if (month) qs.set("month", String(month));
    const q = qs.toString();
    return request<MonthSummary>(
      `/expenses/summary/month${q ? `?${q}` : ""}`
    );
  },

  getExpense(id: string) {
    return request<{ expense: Expense }>(`/expenses/${id}`);
  },

  createExpense(body: Record<string, unknown>) {
    return request<{ expense: Expense }>("/expenses", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  createExpensesBatch(expenses: Record<string, unknown>[]) {
    return request<{
      created: number;
      skipped: number;
      failed: number;
      expenses: Expense[];
      skippedItems: { index: number; reason: string; merchant?: string }[];
      failedItems: { index: number; reason: string }[];
    }>("/expenses/batch", {
      method: "POST",
      body: JSON.stringify({ expenses }),
    });
  },

  updateExpense(id: string, body: Record<string, unknown>) {
    return request<{ expense: Expense }>(`/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  deleteExpense(id: string) {
    return request<{ ok: boolean }>(`/expenses/${id}`, {
      method: "DELETE",
    });
  },

  listCategories() {
    return request<{ categories: Category[] }>("/categories");
  },

  health() {
    return request<{ ok: boolean }>("/health", {}, false);
  },

  ocrImageBase64(imageBase64: string, mimeType = "image/jpeg") {
    return request<{
      text: string;
      engine: string;
      confidence: number | null;
    }>("/ocr", {
      method: "POST",
      body: JSON.stringify({ imageBase64, mimeType }),
    });
  },
};

export { ApiError };
