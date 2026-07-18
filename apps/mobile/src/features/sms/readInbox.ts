import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import type { SmsMessageInput } from "@paymenttracker/shared";

type NativeSmsRow = {
  id?: string | null;
  address?: string | null;
  body?: string | null;
  dateMs?: number | null;
};

type SmsInboxNative = {
  isAvailable: () => Promise<boolean>;
  hasPermission: () => Promise<boolean>;
  listInbox: (maxCount: number, minDateMs: number) => Promise<NativeSmsRow[]>;
};

function getNative(): SmsInboxNative | null {
  if (Platform.OS !== "android") return null;
  const mod = NativeModules.SmsInbox as SmsInboxNative | undefined;
  if (!mod || typeof mod.listInbox !== "function") return null;
  return mod;
}

/** True when the native SmsInbox module is linked (Spentd Android build). */
export function isSmsInboxAvailable(): boolean {
  return getNative() != null;
}

export async function hasSmsPermission(): Promise<boolean> {
  const native = getNative();
  if (!native) return false;
  try {
    return Boolean(await native.hasPermission());
  } catch {
    return false;
  }
}

/**
 * Request READ_SMS. Returns true if granted.
 * No-op (false) on non-Android or when the module is missing.
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!getNative()) return false;

  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );
    if (already) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: "Read payment SMS",
        message:
          "Spentd reads bank and UPI SMS on this device to import payments. Messages never leave your phone.",
        buttonPositive: "Allow",
        buttonNegative: "Not now",
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export type ListInboxOptions = {
  /** Max SMS rows to scan from the inbox (default 500, max 2000). */
  maxCount?: number;
  /** Only messages on or after this time (ms). Default: 90 days ago. */
  minDateMs?: number;
  /** Lookback window in days when minDateMs is omitted (default 90). */
  lookbackDays?: number;
};

/**
 * Read raw inbox rows from the device. Does not parse or filter payments.
 */
export async function listInboxSms(
  options: ListInboxOptions = {}
): Promise<SmsMessageInput[]> {
  const native = getNative();
  if (!native) {
    throw new Error(
      Platform.OS === "android"
        ? "SMS import needs a native Spentd build (not Expo Go). Rebuild with expo run:android."
        : "SMS import is only available on Android."
    );
  }

  const granted = await hasSmsPermission();
  if (!granted) {
    const ok = await requestSmsPermission();
    if (!ok) {
      throw new Error(
        "SMS permission was denied. Enable it in Settings to import payments from messages."
      );
    }
  }

  const maxCount = Math.min(2000, Math.max(1, options.maxCount ?? 500));
  let minDateMs = options.minDateMs;
  if (minDateMs == null) {
    const days = options.lookbackDays ?? 90;
    minDateMs = Date.now() - days * 24 * 60 * 60 * 1000;
  }

  const rows = await native.listInbox(maxCount, minDateMs);
  return (rows ?? []).map((r) => ({
    body: String(r.body ?? ""),
    address: r.address ?? null,
    dateMs: typeof r.dateMs === "number" ? r.dateMs : null,
  }));
}
