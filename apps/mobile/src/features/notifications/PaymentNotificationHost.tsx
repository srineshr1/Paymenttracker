import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  ACTION_CONFIRM,
  ACTION_SELECT,
  confirmPaymentCategory,
  ensurePaymentNotificationsReady,
  flushPendingCategoryConfirms,
  parsePaymentNotifData,
  queueOpenExpense,
  takePendingOpen,
} from "./paymentConfirm";

/**
 * Mount once under the authenticated app tree.
 * Handles Yes / Select the right one on payment-category notifications.
 */
export function PaymentNotificationHost() {
  const { token } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const handledResponseIds = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === "web") return;
    void ensurePaymentNotificationsReady();
  }, []);

  // After unlock: apply queued Yes-confirms + open expense if Select was pending.
  useEffect(() => {
    if (!token) return;

    void flushPendingCategoryConfirms();

    const pending = takePendingOpen();
    if (pending) {
      const path = pending.edit
        ? `/(app)/expenses/${pending.expenseId}?edit=1`
        : `/(app)/expenses/${pending.expenseId}`;
      // Defer so the app stack is mounted after AuthGate.
      const t = setTimeout(() => {
        routerRef.current.push(path as `/expenses/${string}`);
      }, 80);
      return () => clearTimeout(t);
    }
  }, [token]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const openExpense = (expenseId: string, edit: boolean) => {
      if (!token) {
        queueOpenExpense(expenseId, edit);
        return;
      }
      const path = edit
        ? `/(app)/expenses/${expenseId}?edit=1`
        : `/(app)/expenses/${expenseId}`;
      routerRef.current.push(path as `/expenses/${string}`);
    };

    const handleResponse = async (
      response: Notifications.NotificationResponse,
    ) => {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
      if (handledResponseIds.current.has(responseKey)) return;
      handledResponseIds.current.add(responseKey);
      // Cap memory for long sessions
      if (handledResponseIds.current.size > 80) {
        handledResponseIds.current.clear();
      }

      const data = parsePaymentNotifData(
        response.notification.request.content.data,
      );
      if (!data) return;

      const action = response.actionIdentifier;

      if (action === ACTION_CONFIRM) {
        await confirmPaymentCategory(data);
        return;
      }

      // Select the right one, or tap the banner — open expense in edit mode
      // so the user can pick the correct category.
      if (
        action === ACTION_SELECT ||
        action === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        openExpense(data.expenseId, true);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handleResponse(response);
      },
    );

    // Cold start: user opened the app from a notification.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      void handleResponse(last).finally(() => {
        Notifications.clearLastNotificationResponse();
      });
    }

    return () => {
      sub.remove();
    };
  }, [token]);

  return null;
}
