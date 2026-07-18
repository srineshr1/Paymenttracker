import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { AppLogo } from "@/src/components/AppLogo";
import { BudgetSheet } from "@/src/components/BudgetSheet";
import { Card, Screen, Segmented, Text } from "@/src/components/ui";
import {
  type BudgetPrefs,
  computeBudgetPlan,
  DEFAULT_BUDGET,
  DEFAULT_SAVINGS_RATE,
  getBudgetPrefs,
} from "@/src/data/budget";
import { exportExpensesShare } from "@/src/data/export";
import { formatINR } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  disableSmsAutoImport,
  enableSmsAutoImport,
  getSmsAutoImportEnabled,
} from "@/src/features/sms/autoImport";
import { isSmsInboxAvailable } from "@/src/features/sms/readInbox";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, preference, setPreference, mode, isDark } = useTheme();
  const { user, logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetPrefs, setBudgetPrefsState] = useState<BudgetPrefs>({
    mode: "auto",
    manualBudget: DEFAULT_BUDGET,
    savingsRate: DEFAULT_SAVINGS_RATE,
  });
  const [autoPreview, setAutoPreview] = useState(DEFAULT_BUDGET);
  const [smsAuto, setSmsAuto] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const smsSupported =
    Platform.OS === "android" && isSmsInboxAvailable();

  useEffect(() => {
    if (!smsSupported) return;
    void getSmsAutoImportEnabled().then(setSmsAuto);
  }, [smsSupported]);

  const onToggleSmsAuto = async (next: boolean) => {
    if (smsBusy) return;
    setSmsBusy(true);
    try {
      if (next) {
        await enableSmsAutoImport();
        setSmsAuto(true);
      } else {
        await disableSmsAutoImport();
        setSmsAuto(false);
      }
    } catch (e) {
      setSmsAuto(false);
      Alert.alert(
        "SMS auto-import",
        e instanceof Error
          ? e.message
          : "Could not enable SMS listening. Check permissions in system Settings."
      );
    } finally {
      setSmsBusy(false);
    }
  };

  const refreshBudget = useCallback(async () => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const hist = [1, 2, 3].map((back) => {
        const d = new Date(y, m - 1 - back, 1);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      });
      const [prefs, s, ...past] = await Promise.all([
        getBudgetPrefs(),
        api.monthSummary(y, m),
        ...hist.map((h) => api.monthSummary(h.year, h.month)),
      ]);
      let incomeSum = 0;
      let incomeN = 0;
      let spendSum = 0;
      let spendN = 0;
      for (const h of past) {
        const c = Number(h.totalCredit) || 0;
        const d = Number(h.totalDebit) || 0;
        if (c > 0) {
          incomeSum += c;
          incomeN += 1;
        }
        if (d > 0) {
          spendSum += d;
          spendN += 1;
        }
      }
      setBudgetPrefsState(prefs);
      setAutoPreview(
        computeBudgetPlan({
          incomeThisMonth: Number(s.totalCredit) || 0,
          avgIncomeLast3: incomeN > 0 ? incomeSum / incomeN : 0,
          avgSpendLast3: spendN > 0 ? spendSum / spendN : 0,
          spentThisMonth: Number(s.totalDebit) || 0,
          year: y,
          month: m,
          prefs: { ...prefs, mode: "auto" },
        }).budget
      );
    } catch {
      /* ignore — sheet still usable with defaults */
    }
  }, []);

  useEffect(() => {
    void refreshBudget();
  }, [refreshBudget]);

  const initial = (user?.username?.trim()?.[0] ?? "?").toUpperCase();

  const onExport = (format: "csv" | "json") => {
    Alert.alert(
      format === "csv" ? "Export CSV?" : "Export JSON?",
      "Shares a file of decrypted expenses from this device (while unlocked).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: async () => {
            setExporting(true);
            try {
              const { count } = await exportExpensesShare(format);
              Alert.alert(
                "Export ready",
                count === 0
                  ? "No expenses to export yet."
                  : `Shared ${count} expense${count === 1 ? "" : "s"}.`
              );
            } catch (e) {
              Alert.alert(
                "Export failed",
                e instanceof Error ? e.message : "Could not export"
              );
            } finally {
              setExporting(false);
            }
          },
        },
      ]
    );
  };
  const modeLabel =
    preference === "system"
      ? `System · ${mode === "dark" ? "Dark" : "Light"}`
      : mode === "dark"
        ? "Dark mode"
        : "Light mode";

  const onSignOut = () => {
    Alert.alert("Lock Spentd?", "You’ll need your passcode to unlock again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Lock",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Settings" subtitle="Appearance & account" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <View style={styles.profile}>
          <View
            style={[
              styles.monogram,
              { backgroundColor: isDark ? colors.bgMuted : colors.bgElevated },
            ]}
          >
            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 18,
                color: colors.text,
                letterSpacing: 0.5,
              }}
            >
              {initial}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 20,
                letterSpacing: -0.3,
                color: colors.text,
              }}
              numberOfLines={1}
            >
              {user?.username ?? "—"}
            </Text>
            <Text
              muted
              style={{
                marginTop: 4,
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              Local account · on this device
            </Text>
          </View>
        </View>

        {/* Appearance */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Appearance
          </Text>
          <Card variant="elevated" style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={mode === "dark" ? "moon" : "sunny"}
                  size={18}
                  color={colors.accentStrong}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: typography.fontSansSemi,
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  {modeLabel}
                </Text>
                <Text muted style={{ fontSize: 13, marginTop: 2 }}>
                  Warm paper in light · ink & gold in dark
                </Text>
              </View>
            </View>
            <Segmented
              value={preference}
              onChange={(v) =>
                setPreference(v as "system" | "light" | "dark")
              }
              options={[
                { label: "System", value: "system" },
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
              ]}
            />
          </Card>
        </View>

        {/* Budget */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Budget
          </Text>
          <Card variant="elevated" style={styles.listCard}>
            <SettingsRow
              position="only"
              title="Budget & savings"
              subtitle={
                budgetPrefs.mode === "manual"
                  ? `Custom · ${formatINR(budgetPrefs.manualBudget)}`
                  : `Smart · save ${Math.round(budgetPrefs.savingsRate * 100)}% · ~${formatINR(autoPreview)}`
              }
              onPress={() => setBudgetOpen(true)}
            />
          </Card>
        </View>

        {/* SMS auto-import (Android native build) */}
        {smsSupported ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" style={{ marginLeft: 4 }}>
              Payments from SMS
            </Text>
            <Card variant="elevated" style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: colors.accentSoft,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={colors.accentStrong}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      fontSize: 16,
                      color: colors.text,
                    }}
                  >
                    Auto-import SMS
                  </Text>
                  <Text muted style={{ fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                    {smsAuto
                      ? "On · new bank/UPI messages save while unlocked"
                      : "Off · turn on to parse payments as SMS arrives"}
                  </Text>
                </View>
                <Switch
                  value={smsAuto}
                  onValueChange={(v) => void onToggleSmsAuto(v)}
                  disabled={smsBusy}
                  trackColor={{
                    false: colors.borderStrong,
                    true: colors.accent,
                  }}
                  thumbColor={colors.bgCard}
                  accessibilityLabel="Auto-import payments from SMS"
                />
              </View>
              <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
                Stays on this phone. Only high-confidence payment SMS is saved;
                duplicates are skipped. Needs the app unlocked (passcode).
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Account */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Account
          </Text>
          <Card variant="elevated" style={styles.listCard}>
            <SettingsRow
              position="first"
              title="Edit username"
              subtitle="Change how you appear"
              onPress={() => router.push("/(app)/edit-username")}
            />
            <RowDivider />
            <SettingsRow
              position="middle"
              title="Change passcode"
              subtitle="Update your 6-digit code"
              onPress={() => router.push("/(app)/change-passcode")}
            />
            <RowDivider />
            <SettingsRow
              position="last"
              title="Lock now"
              subtitle="Require passcode again"
              onPress={() => {
                logout();
                router.replace("/(auth)/login");
              }}
            />
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Data
          </Text>
          <Card variant="elevated" style={styles.listCard}>
            <SettingsRow
              position="first"
              title="Export CSV"
              subtitle={exporting ? "Preparing…" : "Share expenses as spreadsheet"}
              onPress={() => !exporting && onExport("csv")}
            />
            <RowDivider />
            <SettingsRow
              position="last"
              title="Export JSON"
              subtitle="Full local backup file"
              onPress={() => !exporting && onExport("json")}
            />
          </Card>
          <Text muted style={{ marginLeft: 4, fontSize: 12, lineHeight: 18 }}>
            Everything stays on this device. Export only works while unlocked.
          </Text>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Lock app"
          style={({ pressed }) => [
            styles.signOutBtn,
            {
              backgroundColor: colors.dangerSoft,
              borderColor: isDark
                ? "rgba(217,123,123,0.28)"
                : "rgba(181,74,74,0.22)",
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Ionicons name="lock-closed-outline" size={18} color={colors.danger} />
          <Text
            style={{
              fontFamily: typography.fontSansSemi,
              fontSize: 15,
              color: colors.danger,
            }}
          >
            Lock app
          </Text>
        </Pressable>

        <View style={styles.brandFooter}>
          <AppLogo size={28} />
          <Text
            muted
            style={{
              textAlign: "center",
              fontSize: 12,
              marginTop: spacing.sm,
            }}
          >
            Spentd · v1.0
          </Text>
        </View>
      </ScrollView>

      <BudgetSheet
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        prefs={budgetPrefs}
        autoBudgetPreview={autoPreview}
        onSaved={(next) => {
          setBudgetPrefsState(next);
          void refreshBudget();
        }}
      />
    </Screen>
  );
}

function RowDivider() {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
  );
}

type RowPosition = "first" | "middle" | "last" | "only";

/** Match Card elevated radius (radius.xl) so press fill follows the card shape. */
const CARD_RADIUS = radius.xl;

function rowRadius(position: RowPosition) {
  switch (position) {
    case "first":
      return {
        borderTopLeftRadius: CARD_RADIUS,
        borderTopRightRadius: CARD_RADIUS,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      };
    case "last":
      return {
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: CARD_RADIUS,
        borderBottomRightRadius: CARD_RADIUS,
      };
    case "only":
      return { borderRadius: CARD_RADIUS };
    default:
      return {
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      };
  }
}

function SettingsRow({
  title,
  subtitle,
  onPress,
  position = "middle",
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  position?: RowPosition;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        rowRadius(position),
        pressed && { backgroundColor: colors.bgMuted },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          style={{
            fontFamily: typography.fontSansSemi,
            fontSize: 15,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <Text muted style={{ fontSize: 12, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },

  sectionCard: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  listCard: {
    padding: 0,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
    marginRight: spacing.lg,
  },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  brandFooter: {
    alignItems: "center",
    marginTop: spacing.sm,
    gap: 2,
  },
});
