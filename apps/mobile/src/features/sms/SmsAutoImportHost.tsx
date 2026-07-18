import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  startSmsAutoImport,
  stopSmsAutoImport,
  subscribeAutoImportResults,
} from "./autoImport";
import { getSmsAutoImportEnabled } from "./prefs";
import { isSmsInboxAvailable } from "./readInbox";

/**
 * Mount once under the authenticated app tree.
 * When auto-import is on and the user is unlocked, watches SMS and saves payments.
 */
export function SmsAutoImportHost() {
  const { token } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || !isSmsInboxAvailable()) return;
    if (!token) {
      // Locked / signed out — stop live listen (can't decrypt without DEK)
      started.current = false;
      void stopSmsAutoImport();
      return;
    }

    let cancelled = false;

    (async () => {
      const enabled = await getSmsAutoImportEnabled();
      if (cancelled || !enabled) return;
      started.current = true;
      await startSmsAutoImport();
    })();

    const unsub = subscribeAutoImportResults((r) => {
      if (r.status === "saved") {
        // Lightweight console breadcrumb — UI refresh happens via focus/load.
        if (__DEV__) {
          console.log(
            `[sms-auto] saved ${r.merchant} · ₹${r.amount}`
          );
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
      void stopSmsAutoImport();
      started.current = false;
    };
  }, [token]);

  return null;
}
