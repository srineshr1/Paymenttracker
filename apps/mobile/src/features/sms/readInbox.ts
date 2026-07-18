import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type EmitterSubscription,
} from "react-native";
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
  hasReceivePermission?: () => Promise<boolean>;
  isListening?: () => Promise<boolean>;
  listInbox: (maxCount: number, minDateMs: number) => Promise<NativeSmsRow[]>;
  startListening?: () => Promise<boolean>;
  stopListening?: () => Promise<boolean>;
  drainPending?: () => Promise<NativeSmsRow[]>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
  getConstants?: () => { EVENT_RECEIVED?: string };
};

const EVENT_RECEIVED = "SmsInboxReceived";

function getNative(): SmsInboxNative | null {
  if (Platform.OS !== "android") return null;
  const mod = NativeModules.SmsInbox as SmsInboxNative | undefined;
  if (!mod || typeof mod.listInbox !== "function") return null;
  return mod;
}

function mapRow(r: NativeSmsRow): SmsMessageInput & { id?: string | null } {
  return {
    id: r.id ?? null,
    body: String(r.body ?? ""),
    address: r.address ?? null,
    dateMs: typeof r.dateMs === "number" ? r.dateMs : null,
  };
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
 * Request READ_SMS + RECEIVE_SMS for live import.
 * Returns true if READ_SMS is granted (minimum to scan / observe inbox).
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!getNative()) return false;

  try {
    const readOk = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );
    if (!readOk) {
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
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }

    // Live arrival — optional but preferred
    const receive = PermissionsAndroid.PERMISSIONS.RECEIVE_SMS;
    if (receive) {
      const recvOk = await PermissionsAndroid.check(receive);
      if (!recvOk) {
        await PermissionsAndroid.request(receive, {
          title: "Detect new payment SMS",
          message:
            "Allow Spentd to notice new bank/UPI messages as they arrive and add them automatically.",
          buttonPositive: "Allow",
          buttonNegative: "Not now",
        });
      }
    }

    return true;
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
  return (rows ?? []).map(mapRow);
}

/** Start native ContentObserver + SMS_RECEIVED broadcast. */
export async function startSmsListening(): Promise<void> {
  const native = getNative();
  if (!native?.startListening) {
    throw new Error("Live SMS listening is not available in this build.");
  }
  const granted = await hasSmsPermission();
  if (!granted) {
    const ok = await requestSmsPermission();
    if (!ok) throw new Error("SMS permission was denied.");
  }
  await native.startListening();
}

export async function stopSmsListening(): Promise<void> {
  const native = getNative();
  if (!native?.stopListening) return;
  try {
    await native.stopListening();
  } catch {
    /* ignore */
  }
}

export async function drainPendingSms(): Promise<
  Array<SmsMessageInput & { id?: string | null }>
> {
  const native = getNative();
  if (!native?.drainPending) return [];
  try {
    const rows = await native.drainPending();
    return (rows ?? []).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Subscribe to new SMS events from the native module.
 * Returns an unsubscribe function.
 */
export function subscribeSmsReceived(
  onMessage: (msg: SmsMessageInput & { id?: string | null }) => void
): () => void {
  const native = getNative();
  if (!native) return () => undefined;

  let sub: EmitterSubscription;
  try {
    // Prefer module-scoped emitter when the module implements addListener
    if (typeof native.addListener === "function") {
      const emitter = new NativeEventEmitter(native as never);
      sub = emitter.addListener(EVENT_RECEIVED, (raw: NativeSmsRow) => {
        onMessage(mapRow(raw ?? {}));
      });
    } else {
      sub = DeviceEventEmitter.addListener(
        EVENT_RECEIVED,
        (raw: NativeSmsRow) => {
          onMessage(mapRow(raw ?? {}));
        }
      );
    }
  } catch {
    sub = DeviceEventEmitter.addListener(EVENT_RECEIVED, (raw: NativeSmsRow) => {
      onMessage(mapRow(raw ?? {}));
    });
  }

  return () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
  };
}
