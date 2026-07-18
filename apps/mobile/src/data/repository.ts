/**
 * Local-first data repository — drop-in replacement for the old HTTP `api` client.
 * Backend remains untouched; future sync can wrap this with a remote adapter.
 */
import type {
  AuthResponse,
  Category,
  Expense,
  MonthSummary,
  UserPublic,
} from "@paymenttracker/shared";
import { LocalDataError } from "./crypto";
import {
  changePasscodeLocal,
  clearAllLocalData,
  clearHistoryAndResetPasscode,
  hasLocalAccount,
  loginLocal,
  meLocal,
  registerLocal,
  resetPasscodeAfterDeviceAuth,
  unlockWithPasscodeLocal,
  updateUsernameLocal,
} from "./localAuth";
import { verifyDeviceOwner } from "./deviceAuth";
import {
  createExpense,
  createExpensesBatch,
  deleteExpense,
  getExpense,
  listCategories,
  listExpenses,
  monthSummary,
  updateExpense,
} from "./expenses";
import { getDb } from "./db";

export { LocalDataError };

/** Same shape as former ApiError for screen catch blocks. */
export class ApiError extends LocalDataError {
  constructor(message: string, status: number, body: unknown = null) {
    super(message, status, body);
    this.name = "ApiError";
  }
}

function asApiError(err: unknown): never {
  if (err instanceof LocalDataError) {
    throw new ApiError(err.message, err.status, err.body);
  }
  throw err;
}

export const api = {
  async register(username: string, passcode: string): Promise<AuthResponse> {
    try {
      await getDb();
      return await registerLocal(username, passcode);
    } catch (e) {
      asApiError(e);
    }
  },

  async login(username: string, passcode: string): Promise<AuthResponse> {
    try {
      await getDb();
      return await loginLocal(username, passcode);
    } catch (e) {
      asApiError(e);
    }
  },

  /** Passcode-only unlock for returning users (username already on device). */
  async unlock(passcode: string): Promise<AuthResponse> {
    try {
      await getDb();
      return await unlockWithPasscodeLocal(passcode);
    } catch (e) {
      asApiError(e);
    }
  },

  async hasAccount(): Promise<boolean> {
    try {
      await getDb();
      return await hasLocalAccount();
    } catch {
      return false;
    }
  },

  /** OS lock screen / biometrics before recovery actions. */
  async verifyDevice(): Promise<void> {
    try {
      await verifyDeviceOwner();
    } catch (e) {
      asApiError(e);
    }
  },

  /** Keep history; set new app passcode (call after verifyDevice). */
  async resetPasscodeRecovery(newPasscode: string): Promise<AuthResponse> {
    try {
      await getDb();
      return await resetPasscodeAfterDeviceAuth(newPasscode);
    } catch (e) {
      asApiError(e);
    }
  },

  /** Wipe expenses only, then set new passcode (call after verifyDevice). */
  async clearHistoryRecovery(newPasscode: string): Promise<AuthResponse> {
    try {
      await getDb();
      return await clearHistoryAndResetPasscode(newPasscode);
    } catch (e) {
      asApiError(e);
    }
  },

  /** Full wipe → create account again (call after verifyDevice). */
  async clearAllDataRecovery(): Promise<void> {
    try {
      await getDb();
      await clearAllLocalData();
    } catch (e) {
      asApiError(e);
    }
  },

  async me(): Promise<{ user: UserPublic }> {
    try {
      return await meLocal();
    } catch (e) {
      asApiError(e);
    }
  },

  async changePasscode(
    currentPasscode: string,
    newPasscode: string
  ): Promise<{ ok: true }> {
    try {
      return await changePasscodeLocal(currentPasscode, newPasscode);
    } catch (e) {
      asApiError(e);
    }
  },

  async updateUsername(
    username: string,
    passcode: string
  ): Promise<AuthResponse> {
    try {
      return await updateUsernameLocal(username, passcode);
    } catch (e) {
      asApiError(e);
    }
  },

  async listExpenses(params?: {
    from?: string;
    to?: string;
    q?: string;
    limit?: number;
  }): Promise<{ expenses: Expense[] }> {
    try {
      return await listExpenses(params);
    } catch (e) {
      asApiError(e);
    }
  },

  async monthSummary(year?: number, month?: number): Promise<MonthSummary> {
    try {
      return await monthSummary(year, month);
    } catch (e) {
      asApiError(e);
    }
  },

  async getExpense(id: string): Promise<{ expense: Expense }> {
    try {
      return await getExpense(id);
    } catch (e) {
      asApiError(e);
    }
  },

  async createExpense(
    body: Record<string, unknown>
  ): Promise<{ expense: Expense }> {
    try {
      return await createExpense(body);
    } catch (e) {
      asApiError(e);
    }
  },

  async createExpensesBatch(expenses: Record<string, unknown>[]): Promise<{
    created: number;
    skipped: number;
    failed: number;
    expenses: Expense[];
    skippedItems: { index: number; reason: string; merchant?: string }[];
    failedItems: { index: number; reason: string }[];
  }> {
    try {
      return await createExpensesBatch(expenses);
    } catch (e) {
      asApiError(e);
    }
  },

  async updateExpense(
    id: string,
    body: Record<string, unknown>
  ): Promise<{ expense: Expense }> {
    try {
      return await updateExpense(id, body);
    } catch (e) {
      asApiError(e);
    }
  },

  async deleteExpense(id: string): Promise<{ ok: boolean }> {
    try {
      return await deleteExpense(id);
    } catch (e) {
      asApiError(e);
    }
  },

  async listCategories(): Promise<{ categories: Category[] }> {
    try {
      return await listCategories();
    } catch (e) {
      asApiError(e);
    }
  },

  /** No server — always healthy when local store is reachable. */
  async health(): Promise<{ ok: boolean }> {
    await getDb();
    return { ok: true };
  },

  /**
   * OCR is on-device only; this stub keeps call sites from hitting a network.
   * Use recognizeTextFromBase64 in features/ocr instead.
   */
  async ocrImageBase64(
    _imageBase64: string,
    _mimeType = "image/jpeg"
  ): Promise<{
    text: string;
    engine: string;
    confidence: number | null;
  }> {
    throw new ApiError(
      "On-device OCR is not available in this build. Use manual entry, or add a native OCR module later.",
      501
    );
  },
};

/** Local storage — no remote base URL. */
export function getApiBase(): string {
  return "local://device";
}

export function configureApi(_opts: {
  baseUrl?: string;
  tokenGetter: () => string | null;
}) {
  /* no-op: local vault uses in-memory DEK, not HTTP tokens */
}

export async function ensureApiReachable(): Promise<string> {
  await getDb();
  return "local://device";
}

export function setApiBase(_url: string) {
  /* no-op */
}
