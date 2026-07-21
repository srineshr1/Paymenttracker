import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import {
  disableSmsAutoImport,
  enableSmsAutoImport,
} from "@/src/features/sms/autoImport";
import { importAndSavePaymentsFromSms } from "@/src/features/sms/importSms";
import {
  clearSmsConsentPending,
  setSmsAutoImportEnabled,
} from "@/src/features/sms/prefs";
import { isSmsInboxAvailable } from "@/src/features/sms/readInbox";

const NATIVE_BUILD_HINT =
  "SMS import needs the Spentd APK (not Expo Go).\n\nInstall the APK from GitHub Releases, or rebuild with:\nnpx expo run:android\n\nIf Play Protect blocks install: Settings → Play Protect → turn off scan temporarily, install, then turn it back on. Or use: adb install -r app-release.apk";

export default function SmsConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const finish = async (enable: boolean) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      if (enable && Platform.OS === "android") {
        // Native module missing (Expo Go / bad prebuild) — never claim watching is on.
        if (!isSmsInboxAvailable()) {
          await setSmsAutoImportEnabled(false);
          await clearSmsConsentPending();
          Alert.alert("Native build required", NATIVE_BUILD_HINT, [
            { text: "OK", onPress: () => router.replace("/(app)") },
          ]);
          return;
        }

        // Backfill first (requests SMS permission via inbox read), then enable
        // live listening — same order as Import → SMS, avoids catch-up races.
        let backfillError: string | null = null;
        let liveEnabled = false;
        let liveError: string | null = null;

        try {
          setStatus("Importing past payments…");
          const result = await importAndSavePaymentsFromSms(
            { lookbackDays: 90, maxCount: 2000 },
            (msg) => setStatus(msg),
          );
          if (result.partial && result.created > 0) {
            backfillError = `Imported ${result.created} payments, then hit an error mid-batch.`;
          }
        } catch (e) {
          backfillError =
            e instanceof Error ? e.message : "Could not import past messages.";
        }

        try {
          setStatus("Turning on SMS import…");
          await enableSmsAutoImport();
          liveEnabled = true;
        } catch (e) {
          // Permission denied — keep preference off
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
            [{ text: "OK", onPress: () => router.replace("/(app)") }],
          );
          return;
        }

        if (backfillError) {
          Alert.alert(
            "SMS watching is on",
            `Past messages could not be fully imported — try Import → SMS later.\n\n${backfillError}`,
            [{ text: "OK", onPress: () => router.replace("/(app)") }],
          );
          return;
        }

        router.replace("/(app)");
        return;
      }

      await disableSmsAutoImport();
      await clearSmsConsentPending();
      router.replace("/(app)");
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
              ? status?.startsWith("Found") || status?.startsWith("Importing")
                ? "Importing…"
                : status?.includes("Scanning")
                  ? "Scanning…"
                  : "Please wait…"
              : "Agree"
          }
          loading={busy}
          disabled={busy}
          onPress={() => finish(true)}
        />
        <Button
          title="Disagree"
          variant="ghost"
          disabled={busy}
          onPress={() => finish(false)}
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
