import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import {
  disableSmsAutoImport,
  enableSmsAutoImport,
} from "@/src/features/sms/autoImport";
import {
  clearSmsConsentPending,
  setSmsAutoImportEnabled,
} from "@/src/features/sms/prefs";

export default function SmsConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const finish = async (enable: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (enable && Platform.OS === "android") {
        try {
          await enableSmsAutoImport();
        } catch {
          // Permission denied or Expo Go — keep preference off
          await setSmsAutoImportEnabled(false);
        }
      } else {
        await disableSmsAutoImport();
      }
      await clearSmsConsentPending();
      router.replace("/(app)");
    } finally {
      setBusy(false);
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
        <Button
          title={busy ? "Please wait…" : "Agree"}
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
