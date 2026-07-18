import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Expense, MonthSummary } from "@paymenttracker/shared";
import { api } from "@/src/api/client";
import { AddPaymentsMenu } from "@/src/components/AddPaymentsMenu";
import { ExpenseRow } from "@/src/components/ExpenseRow";
import {
  Card,
  EmptyState,
  Screen,
  Text,
} from "@/src/components/ui";
import { formatINR, formatMonthYear } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [recent, setRecent] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const monthStart = new Date(cursor.year, cursor.month - 1, 1);
      const monthEnd = new Date(cursor.year, cursor.month, 0, 23, 59, 59, 999);
      const [s, list] = await Promise.all([
        api.monthSummary(cursor.year, cursor.month),
        api.listExpenses({
          limit: 8,
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
        }),
      ]);
      setSummary(s);
      setRecent(list.expenses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cursor.year, cursor.month]);

  useFocusEffect(
    useCallback(() => {
      // Collapse FAB after the transition settles. setState during the native
      // stack animation blanks the previous scene on Android (New Arch).
      const ready = requestAnimationFrame(() => {
        setAddOpen(false);
        // Refresh quietly — don't flip loading=true (that blanks the page on every back).
        void load();
      });
      return () => {
        cancelAnimationFrame(ready);
      };
    }, [load])
  );

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.xl,
        }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text variant="label">Welcome back</Text>
            <Text variant="hero" style={{ marginTop: 4, fontSize: 28 }}>
              {user?.username}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setAddOpen(false);
              router.push("/(app)/settings");
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={({ pressed }) => [
              styles.settingsBtn,
              {
                backgroundColor: colors.bgMuted,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons
              name="settings-outline"
              size={22}
              color={colors.text}
            />
          </Pressable>
        </View>

        <Card variant="hero">
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={10}
              style={styles.monthBtn}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text variant="label" style={{ flex: 1, textAlign: "center" }}>
              {formatMonthYear(cursor.year, cursor.month)}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={10}
              style={styles.monthBtn}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>
          {loading && !summary ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginTop: spacing.lg }}
            />
          ) : (
            <>
              <Text
                style={{
                  // Outfit (not mono) — IBM Plex Mono mangles "," on Android
                  fontFamily: typography.fontSansBold,
                  fontSize: 42,
                  // Explicit lineHeight + padding so large Outfit glyphs
                  // (especially ",") aren't clipped on Android.
                  lineHeight: 40,
                  paddingVertical: 4,
                  letterSpacing: 0,
                  color: colors.text,
                  marginTop: spacing.md,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {formatINR(summary?.totalDebit ?? "0")}
              </Text>
              <Text muted style={{ marginTop: spacing.sm }}>
                Spent this month
              </Text>
              <View
                style={[styles.heroMeta, { borderTopColor: colors.border }]}
              >
                <View>
                  <Text variant="caption">Received</Text>
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      color: colors.credit,
                      marginTop: 2,
                      fontSize: 16,
                    }}
                  >
                    {formatINR(summary?.totalCredit ?? "0")}
                  </Text>
                </View>
                <View>
                  <Text variant="caption">Entries</Text>
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      color: colors.text,
                      marginTop: 2,
                      fontSize: 16,
                    }}
                  >
                    {summary?.count ?? 0}
                  </Text>
                </View>
              </View>
            </>
          )}
        </Card>

        <View>
          <View style={styles.sectionHead}>
            <Text variant="title">Recent</Text>
            <Pressable
              onPress={() => router.push("/(app)/expenses")}
              hitSlop={8}
            >
              <Text
                style={{
                  fontFamily: typography.fontSansMedium,
                  color: colors.accentStrong,
                  fontSize: 15,
                }}
              >
                See all
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text color={colors.danger} style={{ marginTop: spacing.md }}>
              {error}
            </Text>
          ) : null}

          {!loading && recent.length === 0 ? (
            <EmptyState
              title="No expenses yet"
              body="Tap Add payments to import a PhonePe/GPay screenshot or enter one manually."
            />
          ) : (
            <Card variant="outline" style={{ paddingVertical: spacing.sm }}>
              {recent.map((e, i) => (
                <View key={e.id}>
                  <ExpenseRow
                    expense={e}
                    onPress={() => router.push(`/(app)/expenses/${e.id}`)}
                  />
                  {i < recent.length - 1 ? (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: colors.border,
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      <AddPaymentsMenu
        open={addOpen}
        onOpenChange={setAddOpen}
        onManual={() => router.push("/(app)/add")}
        onScreenshot={() => router.push("/(app)/import")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  heroMeta: {
    flexDirection: "row",
    gap: spacing.xxl,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  monthBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
