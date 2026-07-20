import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { BudgetSheet } from "@/src/components/BudgetSheet";
import { Screen, Text } from "@/src/components/ui";
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

/** Docs page for SMS auto-import — update when the site is live. */
const SMS_AUTO_IMPORT_INFO_URL = "https://spentd.app/sms-auto-import";

const GROUP_RADIUS = radius.lg;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, preference, setPreference, isDark } = useTheme();
  const { user, logout, runWithoutAppLock } = useAuth();
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
  const smsSupported = Platform.OS === "android" && isSmsInboxAvailable();

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
          : "Could not enable SMS listening. Check permissions in system Settings.",
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
        }).budget,
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
      "Share a file of expenses from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: async () => {
            setExporting(true);
            try {
              const { count } = await runWithoutAppLock(() =>
                exportExpensesShare(format),
              );
              Alert.alert(
                "Export ready",
                count === 0
                  ? "No expenses to export yet."
                  : `Shared ${count} expense${count === 1 ? "" : "s"}.`,
              );
            } catch (e) {
              Alert.alert(
                "Export failed",
                e instanceof Error ? e.message : "Could not export",
              );
            } finally {
              setExporting(false);
            }
          },
        },
      ],
    );
  };

  const themeValue =
    preference === "system"
      ? "System"
      : preference === "dark"
        ? "Dark"
        : "Light";

  const budgetValue =
    budgetPrefs.mode === "manual"
      ? formatINR(budgetPrefs.manualBudget)
      : `${Math.round(budgetPrefs.savingsRate * 100)}% · ${formatINR(autoPreview)}`;

  const onBack = useCallback(() => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      /* fall through */
    }
    router.replace("/(app)");
  }, [navigation, router]);

  const onSignOut = () => {
    Alert.alert("Lock app?", "You’ll need your passcode to unlock again.", [
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

  const onPickTheme = () => {
    Alert.alert("Appearance", undefined, [
      {
        text: "System",
        onPress: () => setPreference("system"),
      },
      {
        text: "Light",
        onPress: () => setPreference("light"),
      },
      {
        text: "Dark",
        onPress: () => setPreference("dark"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const topBarBg = isDark
    ? "rgba(10, 11, 13, 0.52)"
    : "rgba(246, 242, 235, 0.52)";
  const chipBg = isDark ? "rgba(28, 33, 43, 0.4)" : "rgba(255, 255, 255, 0.4)";
  /** Back + title row under the status bar. */
  const topBarBody = 52;
  const topBarHeight = insets.top + spacing.sm + topBarBody + spacing.md;

  return (
    <Screen style={{ backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: topBarHeight + spacing.md,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account identity — system-settings style profile row */}
        <View style={[styles.group, { backgroundColor: colors.bgElevated }]}>
          <Pressable
            onPress={() => router.push("/(app)/edit-username")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.profileRow,
              pressed && { backgroundColor: colors.bgMuted },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.bgMuted }]}>
              <Text style={[styles.avatarLetter, { color: colors.text }]}>
                {initial}
              </Text>
            </View>
            <View style={styles.rowBody}>
              <Text
                style={[styles.rowTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {user?.username ?? "Account"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                Local account on this device
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        <SectionLabel>General</SectionLabel>
        <View style={[styles.group, { backgroundColor: colors.bgElevated }]}>
          <SettingsRow
            icon="contrast-outline"
            title="Appearance"
            value={themeValue}
            onPress={onPickTheme}
            position="first"
            showDivider
          />
          <SettingsRow
            icon="wallet-outline"
            title="Budget & savings"
            value={budgetValue}
            onPress={() => setBudgetOpen(true)}
            position={smsSupported ? "middle" : "last"}
            showDivider={smsSupported}
          />
          {smsSupported ? (
            <SettingsToggleRow
              icon="chatbubble-ellipses-outline"
              title="Auto-import SMS"
              value={smsAuto}
              onValueChange={(v) => void onToggleSmsAuto(v)}
              disabled={smsBusy}
              onInfo={() => void Linking.openURL(SMS_AUTO_IMPORT_INFO_URL)}
              position="last"
            />
          ) : null}
        </View>

        <SectionLabel>Security</SectionLabel>
        <View style={[styles.group, { backgroundColor: colors.bgElevated }]}>
          <SettingsRow
            icon="keypad-outline"
            title="Change passcode"
            onPress={() => router.push("/(app)/change-passcode")}
            position="only"
          />
        </View>

        <SectionLabel>Data</SectionLabel>
        <View style={[styles.group, { backgroundColor: colors.bgElevated }]}>
          <SettingsRow
            icon="document-text-outline"
            title="Export CSV"
            value={exporting ? "Preparing…" : undefined}
            onPress={() => !exporting && onExport("csv")}
            position="first"
            showDivider
          />
          <SettingsRow
            icon="code-slash-outline"
            title="Export JSON"
            onPress={() => !exporting && onExport("json")}
            position="last"
          />
        </View>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.bgElevated, marginTop: spacing.xl },
          ]}
        >
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Lock app"
            style={({ pressed }) => [
              styles.lockRow,
              pressed && { backgroundColor: colors.bgMuted },
            ]}
          >
            <View
              style={[styles.iconBadge, { backgroundColor: colors.dangerSoft }]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={colors.danger}
              />
            </View>
            <Text style={[styles.rowTitle, { color: colors.danger, flex: 1 }]}>
              Lock app
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Spentd 1.0
        </Text>
      </ScrollView>

      {/* Translucent overlay — content scrolls underneath */}
      <View
        pointerEvents="box-none"
        style={[
          styles.topBar,
          {
            height: topBarHeight,
            paddingTop: insets.top + spacing.sm,
            backgroundColor: topBarBg,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: chipBg,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        <Text style={[styles.pageTitle, { color: colors.text, flex: 1 }]}>
          Settings
        </Text>
      </View>

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

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
      {children}
    </Text>
  );
}

type RowPosition = "first" | "middle" | "last" | "only";

function rowRadius(position: RowPosition) {
  switch (position) {
    case "first":
      return {
        borderTopLeftRadius: GROUP_RADIUS,
        borderTopRightRadius: GROUP_RADIUS,
      };
    case "last":
      return {
        borderBottomLeftRadius: GROUP_RADIUS,
        borderBottomRightRadius: GROUP_RADIUS,
      };
    case "only":
      return { borderRadius: GROUP_RADIUS };
    default:
      return {};
  }
}

function SettingsRow({
  icon,
  title,
  value,
  onPress,
  position = "middle",
  showDivider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value?: string;
  onPress: () => void;
  position?: RowPosition;
  showDivider?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          rowRadius(position),
          pressed && { backgroundColor: colors.bgMuted },
        ]}
      >
        <View style={[styles.iconBadge, { backgroundColor: colors.bgMuted }]}>
          <Ionicons name={icon} size={18} color={colors.text} />
        </View>
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>
          {title}
        </Text>
        {value ? (
          <Text
            style={[styles.rowValue, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      ) : null}
    </>
  );
}

function SettingsToggleRow({
  icon,
  title,
  value,
  onValueChange,
  disabled,
  onInfo,
  position = "middle",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  onInfo?: () => void;
  position?: RowPosition;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, rowRadius(position)]}>
      <Pressable
        onPress={onInfo}
        disabled={!onInfo}
        accessibilityRole={onInfo ? "link" : "text"}
        style={styles.toggleLabel}
      >
        <View style={[styles.iconBadge, { backgroundColor: colors.bgMuted }]}>
          <Ionicons name={icon} size={18} color={colors.text} />
        </View>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
      </Pressable>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: colors.borderStrong,
          true: colors.accent,
        }}
        thumbColor={colors.bgCard}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontFamily: typography.fontSansBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  group: {
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: 13,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontFamily: typography.fontSansSemi,
    fontSize: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 54,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: 16,
  },
  rowSub: {
    fontFamily: typography.fontSans,
    fontSize: 13,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: typography.fontSans,
    fontSize: 15,
    maxWidth: "42%",
    textAlign: "right",
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 32 + spacing.md,
  },
  toggleLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 54,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  footer: {
    fontFamily: typography.fontSans,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
