import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  disableSmsAutoImport,
  enableSmsAutoImport,
} from "@/src/features/sms/autoImport";
import { importAndSavePaymentsFromSms } from "@/src/features/sms/importSms";
import {
  clearSmsConsentPending,
  setSmsAutoImportEnabled,
} from "@/src/features/sms/prefs";
import {
  hasSmsPermission,
  isSmsInboxAvailable,
  requestSmsPermission,
} from "@/src/features/sms/readInbox";

const NATIVE_BUILD_HINT =
  "SMS import needs the Spentd APK (not Expo Go).\n\nInstall the APK from GitHub Releases, or rebuild with:\nnpx expo run:android\n\nIf Play Protect blocks install: Settings → Play Protect → turn off scan temporarily, install, then turn it back on. Or use: adb install -r app-release.apk";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function SmsConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { runWithoutAppLock } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const goHome = () => {
    router.replace("/(app)");
  };

  const finish = async (enable: boolean) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      if (!enable) {
        await disableSmsAutoImport();
        await clearSmsConsentPending();
        goHome();
        return;
      }

      if (Platform.OS !== "android") {
        await setSmsAutoImportEnabled(false);
        await clearSmsConsentPending();
        goHome();
        return;
      }

      // Whole Agree path stays unlocked — the SMS permission dialog backgrounds
      // the app, which would otherwise lock the vault and abort the import.
      await runWithoutAppLock(async () => {
        if (!isSmsInboxAvailable()) {
          await setSmsAutoImportEnabled(false);
          await clearSmsConsentPending();
          Alert.alert("Native build required", NATIVE_BUILD_HINT, [
            { text: "OK", onPress: goHome },
          ]);
          return;
        }

        // 1) Ask for READ_SMS first so the user sees a clear step
        setStatus("Waiting for SMS permission…");
        let granted = await hasSmsPermission();
        if (!granted) {
          granted = await requestSmsPermission();
        }
        if (!granted) {
          await setSmsAutoImportEnabled(false);
          await clearSmsConsentPending();
          Alert.alert(
            "SMS permission needed",
            "Without message access Spentd can’t import payments. You can enable it later in Settings → Auto-import SMS.",
            [{ text: "OK", onPress: goHome }],
          );
          return;
        }

        // OEM race: grant is live a tick after the dialog dismisses
        await sleep(350);

        // 2) Backfill history while vault is still unlocked
        let created = 0;
        let scanned = 0;
        let paymentLike = 0;
        let backfillError: string | null = null;

        try {
          setStatus("Scanning messages…");
          const result = await importAndSavePaymentsFromSms(
            { lookbackDays: 90, maxCount: 2000 },
            (msg) => setStatus(msg),
          );
          created = result.created;
          scanned = result.scanned;
          paymentLike = result.paymentLike;
          if (result.partial && result.created > 0) {
            backfillError = `Imported ${result.created} payments, then hit an error mid-batch.`;
          }
        } catch (e) {
          backfillError =
            e instanceof Error ? e.message : "Could not import past messages.";
        }

        // 3) Live listening
        let liveEnabled = false;
        let liveError: string | null = null;
        try {
          setStatus("Turning on SMS import…");
          await enableSmsAutoImport();
          liveEnabled = true;
        } catch (e) {
          await setSmsAutoImportEnabled(false);
          liveError =
            e instanceof Error
              ? e.message
              : "Could not enable SMS listening. Check permissions in Settings.";
        }

        await clearSmsConsentPending();

        if (!liveEnabled) {
          Alert.alert(
            "SMS import not enabled",
            [backfillError, liveError].filter(Boolean).join("\n\n") ||
              "SMS permission was denied or unavailable.",
            [{ text: "OK", onPress: goHome }],
          );
          return;
        }

        if (backfillError) {
          Alert.alert(
            "SMS watching is on",
            `Past messages could not be fully imported — open Import → SMS later.\n\n${backfillError}`,
            [{ text: "OK", onPress: goHome }],
          );
          return;
        }

        // Always confirm what happened so an empty dashboard isn’t a mystery
        if (created > 0) {
          Alert.alert(
            "SMS import on",
            `Added ${created} payment${created === 1 ? "" : "s"} from your messages. New bank/UPI SMS will import automatically.`,
            [{ text: "OK", onPress: goHome }],
          );
          return;
        }

        if (paymentLike > 0 || scanned > 0) {
          Alert.alert(
            "SMS watching is on",
            scanned === 0
              ? "Permission is on, but no messages were readable yet. Try Import → SMS after a moment."
              : `Scanned ${scanned} message${scanned === 1 ? "" : "s"} (${paymentLike} looked like payments) — none were new enough to import. Open Import → SMS to review.`,
            [
              {
                text: "Review SMS",
                onPress: () => router.replace("/(app)/import/sms" as never),
              },
              { text: "Home", onPress: goHome, style: "cancel" },
            ],
          );
          return;
        }

        Alert.alert(
          "SMS watching is on",
          "No bank or UPI messages found in the last 90 days. New payment SMS will still import automatically.",
          [{ text: "OK", onPress: goHome }],
        );
      });
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <Screen
      style={{
        paddingTop: insets.top + spacing.xxl,
        paddingBottom: Math.max(insets.bottom, spacing.lg),
        paddingHorizontal: spacing.xl,
      }}
    >
      <View style={styles.body}>
        <Text variant="label" style={{ color: colors.accentStrong }}>
          Optional
        </Text>
        <Text
          style={{
            fontFamily: typography.fontDisplay,
            fontSize: 32,
            lineHeight: 38,
            letterSpacing: -0.6,
            color: colors.text,
            marginTop: spacing.md,
          }}
        >
          Read bank SMS{"\n"}automatically?
        </Text>
        <Text
          muted
          style={{
            marginTop: spacing.lg,
            fontSize: 16,
            lineHeight: 24,
            maxWidth: 340,
          }}
        >
          Spentd can watch bank and UPI messages on this phone and add payments
          for you — so your balance stays up to date without screenshots.
        </Text>

        <View
          style={[
            styles.points,
            { borderColor: colors.border, backgroundColor: colors.bgMuted },
          ]}
        >
          <Text style={[styles.point, { color: colors.textSecondary }]}>
            Messages stay on your device
          </Text>
          <Text style={[styles.point, { color: colors.textSecondary }]}>
            Nothing is uploaded or shared
          </Text>
          <Text style={[styles.point, { color: colors.textSecondary }]}>
            You can turn this off anytime in Settings
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {status ? (
          <Text
            muted
            style={{
              textAlign: "center",
              fontSize: 13,
              lineHeight: 18,
              marginBottom: spacing.md,
            }}
          >
            {status}
          </Text>
        ) : null}
        <Button
          title={
            busy
              ? status?.includes("permission")
                ? "Waiting for permission…"
                : status?.startsWith("Found") ||
                    status?.startsWith("Importing") ||
                    status?.includes("Categorizing")
                  ? "Importing…"
                  : status?.includes("Scanning")
                    ? "Scanning…"
                    : "Please wait…"
              : "Agree"
          }
          loading={busy}
          disabled={busy}
          onPress={() => void finish(true)}
        />
        <Button
          title="Disagree"
          variant="ghost"
          disabled={busy}
          onPress={() => void finish(false)}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing.xxl,
  },
  points: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  point: {
    fontFamily: typography.fontSans,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    width: "100%",
    paddingTop: spacing.md,
  },
});
