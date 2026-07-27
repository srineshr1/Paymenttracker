/**
 * Local notifications after SMS auto-import:
 *  - Guess a category (learned mapping → rules)
 *  - Ask the user: Yes (confirm) or Select the right one (open expense edit)
 *
 * Privacy: all data stays on-device; no push server.
 */
import type { Expense } from "@paymenttracker/shared";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { learnMerchantCategory } from "@/src/data/categoryLearning";
import { isUnlocked } from "@/src/data/crypto";
import { formatINR } from "@/src/design/format";

export const PAYMENT_CHANNEL_ID = "payment-category";
export const PAYMENT_CATEGORY_ID = "payment_category_confirm";
export const ACTION_CONFIRM = "confirm_category";
export const ACTION_SELECT = "select_category";

export type PaymentNotifData = {
  type: "payment_category";
  expenseId: string;
  merchant: string;
  categoryId: string | null;
  categoryName: string;
  amount: string;
  direction: "debit" | "credit";
};

type PendingConfirm = {
  expenseId: string;
  merchant: string;
  categoryId: string | null;
};

type PendingOpen = {
  expenseId: string;
  edit: boolean;
};

let setupDone = false;
let pendingConfirms: PendingConfirm[] = [];
let pendingOpen: PendingOpen | null = null;

/** Show banners even while Spentd is in the foreground. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function isPaymentNotifData(data: unknown): data is PaymentNotifData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === "payment_category" && typeof d.expenseId === "string";
}

export function parsePaymentNotifData(data: unknown): PaymentNotifData | null {
  if (!isPaymentNotifData(data)) return null;
  return {
    type: "payment_category",
    expenseId: data.expenseId,
    merchant: typeof data.merchant === "string" ? data.merchant : "",
    categoryId: typeof data.categoryId === "string" ? data.categoryId : null,
    categoryName:
      typeof data.categoryName === "string" ? data.categoryName : "Other",
    amount: typeof data.amount === "string" ? data.amount : "",
    direction: data.direction === "credit" ? "credit" : "debit",
  };
}

/**
 * Create the Android channel + interactive category (Yes / Select).
 * Safe to call repeatedly.
 */
export async function ensurePaymentNotificationsReady(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(PAYMENT_CHANNEL_ID, {
      name: "Payment category",
      description:
        "Confirm the category Spentd guessed for a new bank or UPI payment",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#C4A574",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(PAYMENT_CATEGORY_ID, [
    {
      identifier: ACTION_CONFIRM,
      buttonTitle: "Yes",
      options: {
        opensAppToForeground: false,
        isAuthenticationRequired: false,
        isDestructive: false,
      },
    },
    {
      identifier: ACTION_SELECT,
      buttonTitle: "Select the right one",
      options: {
        opensAppToForeground: true,
        isAuthenticationRequired: false,
        isDestructive: false,
      },
    },
  ]);

  setupDone = true;
  return true;
}

/** Prompt for notification permission (Android 13+ / iOS). */
export async function requestPaymentNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await ensurePaymentNotificationsReady();

  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return (
    next.granted ||
    next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function hasPaymentNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const settings = await Notifications.getPermissionsAsync();
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * After a payment is auto-saved, ask the user to confirm the guessed category.
 * Best-effort: never throws into the import path.
 */
export async function notifyPaymentCategoryConfirm(
  expense: Expense,
): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    await ensurePaymentNotificationsReady();
    const allowed = await hasPaymentNotificationPermission();
    if (!allowed) return;

    const categoryName = expense.category?.name?.trim() || "Other";
    const merchant = expense.merchant?.trim() || "Payment";
    const amountLabel = formatINR(expense.amount);
    const verb = expense.direction === "credit" ? "Received" : "Paid";

    const data: PaymentNotifData = {
      type: "payment_category",
      expenseId: expense.id,
      merchant,
      categoryId: expense.categoryId ?? expense.category?.id ?? null,
      categoryName,
      amount: String(expense.amount),
      direction: expense.direction,
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${verb} ${amountLabel} · ${merchant}`,
        body: `Looks like ${categoryName} — is that right?`,
        data,
        categoryIdentifier: PAYMENT_CATEGORY_ID,
        sound: true,
        ...(Platform.OS === "android"
          ? {
              channelId: PAYMENT_CHANNEL_ID,
              color: "#C4A574",
              priority: Notifications.AndroidNotificationPriority.HIGH,
            }
          : {}),
      },
      trigger: null,
      identifier: `payment-cat-${expense.id}`,
    });
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Confirm the guessed category (Yes). Learns merchant → category when unlocked.
 * Queues work if the vault is locked.
 */
export async function confirmPaymentCategory(
  data: PaymentNotifData,
): Promise<"ok" | "queued" | "skipped"> {
  if (!data.merchant) return "skipped";

  if (!isUnlocked()) {
    pendingConfirms.push({
      expenseId: data.expenseId,
      merchant: data.merchant,
      categoryId: data.categoryId,
    });
    return "queued";
  }

  if (data.categoryId) {
    await learnMerchantCategory(data.merchant, data.categoryId);
  }

  try {
    await Notifications.dismissNotificationAsync(
      `payment-cat-${data.expenseId}`,
    );
  } catch {
    /* already gone */
  }
  return "ok";
}

/** Remember that we should open expense edit after unlock / next frame. */
export function queueOpenExpense(expenseId: string, edit = true) {
  pendingOpen = { expenseId, edit };
}

export function takePendingOpen(): PendingOpen | null {
  const next = pendingOpen;
  pendingOpen = null;
  return next;
}

export function peekPendingOpen(): PendingOpen | null {
  return pendingOpen;
}

/** Apply Yes-confirms that arrived while the vault was locked. */
export async function flushPendingCategoryConfirms(): Promise<number> {
  if (!isUnlocked() || pendingConfirms.length === 0) return 0;
  const batch = pendingConfirms;
  pendingConfirms = [];
  let n = 0;
  for (const item of batch) {
    if (item.categoryId && item.merchant) {
      const ok = await learnMerchantCategory(item.merchant, item.categoryId);
      if (ok) n += 1;
    }
    try {
      await Notifications.dismissNotificationAsync(
        `payment-cat-${item.expenseId}`,
      );
    } catch {
      /* ignore */
    }
  }
  return n;
}

export function isSetupDone(): boolean {
  return setupDone;
}
