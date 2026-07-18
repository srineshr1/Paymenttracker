import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { DonutChart } from "@/src/components/DonutChart";
import { WeekBars, type WeekDayBar } from "@/src/components/WeekBars";
import { Amount, Card, EmptyState, Screen, Text } from "@/src/components/ui";
import { getMonthlyBudget } from "@/src/data/budget";
import {
  formatINR,
  formatINRCompact,
  formatMonthShort,
  formatRelativePaidAt,
} from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

type CategorySlice = {
  key: string;
  name: string;
  color: string;
  amount: number;
  pct: number;
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  food: "restaurant-outline",
  travel: "car-outline",
  shopping: "bag-handle-outline",
  bills: "receipt-outline",
  transfer: "swap-horizontal-outline",
  entertainment: "film-outline",
  health: "heart-outline",
  other: "pricetag-outline",
};

function startOfWeekMonday(d = new Date()) {
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function buildCategorySlices(expenses: Expense[]): CategorySlice[] {
  const debits = expenses.filter((e) => e.direction === "debit");
  const map = new Map<string, { name: string; color: string; amount: number }>();
  let total = 0;

  for (const e of debits) {
    const amount = Number(e.amount) || 0;
    if (amount <= 0) continue;
    total += amount;
    const key = e.category?.slug ?? e.categoryId ?? "other";
    const name = e.category?.name ?? "Others";
    const color = e.category?.color ?? "#C4A574";
    const cur = map.get(key) ?? { name, color, amount: 0 };
    cur.amount += amount;
    map.set(key, cur);
  }

  if (total <= 0) return [];

  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      name: v.name,
      color: v.color,
      amount: v.amount,
      pct: Math.round((v.amount / total) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildWeekBars(expenses: Expense[], now = new Date()): WeekDayBar[] {
  const weekStart = startOfWeekMonday(now);
  const byDay = Array.from({ length: 7 }, () => 0);

  for (const e of expenses) {
    if (e.direction !== "debit") continue;
    const d = new Date(e.paidAt);
    if (Number.isNaN(d.getTime())) continue;
    const idx = Math.floor(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        weekStart.getTime()) /
        86_400_000
    );
    if (idx < 0 || idx > 6) continue;
    byDay[idx] += Number(e.amount) || 0;
  }

  const todayIdx = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      weekStart.getTime()) /
      86_400_000
  );

  return byDay.map((amount, dayIndex) => ({
    dayIndex,
    amount,
    active: dayIndex === todayIdx,
    empty: dayIndex > todayIdx,
  }));
}

function categoryIcon(slug?: string | null): keyof typeof Ionicons.glyphMap {
  if (!slug) return "ellipse-outline";
  return CATEGORY_ICONS[slug] ?? "ellipse-outline";
}

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
  const [prevSummary, setPrevSummary] = useState<MonthSummary | null>(null);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [weekExpenses, setWeekExpenses] = useState<Expense[]>([]);
  const [recent, setRecent] = useState<Expense[]>([]);
  const [budget, setBudget] = useState(60000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const monthStart = new Date(cursor.year, cursor.month - 1, 1);
      const monthEnd = new Date(cursor.year, cursor.month, 0, 23, 59, 59, 999);
      const prev = new Date(cursor.year, cursor.month - 2, 1);
      const weekStart = startOfWeekMonday();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const [s, prevS, monthList, weekList, recentList, b] = await Promise.all([
        api.monthSummary(cursor.year, cursor.month),
        api.monthSummary(prev.getFullYear(), prev.getMonth() + 1),
        api.listExpenses({
          limit: 200,
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
        }),
        api.listExpenses({
          limit: 200,
          from: weekStart.toISOString(),
          to: weekEnd.toISOString(),
        }),
        api.listExpenses({ limit: 6 }),
        getMonthlyBudget(),
      ]);

      setSummary(s);
      setPrevSummary(prevS);
      setMonthExpenses(monthList.expenses);
      setWeekExpenses(weekList.expenses);
      setRecent(recentList.expenses);
      setBudget(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cursor.year, cursor.month]);

  useFocusEffect(
    useCallback(() => {
      const ready = requestAnimationFrame(() => {
        setAddOpen(false);
        void load();
      });
      return () => cancelAnimationFrame(ready);
    }, [load])
  );

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const spent = Number(summary?.totalDebit ?? 0) || 0;
  const received = Number(summary?.totalCredit ?? 0) || 0;
  const prevSpent = Number(prevSummary?.totalDebit ?? 0) || 0;
  const change = pctChange(spent, prevSpent);
  const budgetPct = budget > 0 ? Math.min(1, spent / budget) : 0;

  const categories = useMemo(
    () => buildCategorySlices(monthExpenses),
    [monthExpenses]
  );
  const weekBars = useMemo(() => buildWeekBars(weekExpenses), [weekExpenses]);
  const weekSpent = weekBars.reduce((s, d) => s + d.amount, 0);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text variant="label">Welcome back</Text>
            <Text
              style={{
                fontFamily: typography.fontDisplay,
                fontSize: 34,
                lineHeight: 40,
                letterSpacing: -0.6,
                color: colors.text,
                marginTop: 2,
              }}
            >
              {user?.username ?? "there"}
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
              styles.iconBtn,
              {
                backgroundColor: colors.bgMuted,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        <Card
          variant="hero"
          style={{ gap: spacing.sm, padding: spacing.lg }}
        >
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={10}
              style={styles.monthBtn}
            >
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </Pressable>
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: typography.fontSansSemi,
                fontSize: 11,
                letterSpacing: 1.2,
                color: colors.textSecondary,
              }}
            >
              {formatMonthShort(cursor.year, cursor.month)}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={10}
              style={styles.monthBtn}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {loading && !summary ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginVertical: spacing.md }}
            />
          ) : (
            <>
              <View style={styles.spentRow}>
                <Text
                  style={{
                    fontFamily: typography.fontSansBold,
                    fontSize: 34,
                    lineHeight: 40,
                    letterSpacing: -0.4,
                    color: colors.text,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {formatINR(spent)}
                </Text>
                {change != null ? (
                  <View
                    style={[
                      styles.changePill,
                      {
                        backgroundColor:
                          change !== 0
                            ? "rgba(143,203,176,0.14)"
                            : colors.bgMuted,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        change > 0
                          ? "arrow-up"
                          : change < 0
                            ? "arrow-down"
                            : "remove"
                      }
                      size={11}
                      color={colors.credit}
                    />
                    <Text
                      style={{
                        fontFamily: typography.fontSansSemi,
                        fontSize: 11,
                        color: colors.credit,
                      }}
                    >
                      {Math.abs(change)}%
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text muted style={{ fontSize: 13, marginTop: -2 }}>
                Spent this month
              </Text>

              <View style={{ gap: 6, marginTop: 2 }}>
                <View style={styles.budgetRow}>
                  <Text
                    style={{
                      fontFamily: typography.fontSansMedium,
                      fontSize: 12,
                      color: colors.textSecondary,
                    }}
                  >
                    Monthly budget
                  </Text>
                  <Text
                    style={{
                      fontFamily: typography.fontSansMedium,
                      fontSize: 12,
                      color: colors.textSecondary,
                    }}
                  >
                    {formatINR(spent)} of {formatINR(budget)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.budgetTrack,
                    { backgroundColor: colors.bgMuted },
                  ]}
                >
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${Math.round(budgetPct * 100)}%`,
                        backgroundColor:
                          budgetPct > 0.9 ? colors.danger : colors.accent,
                      },
                    ]}
                  />
                </View>
              </View>

              <View
                style={[styles.heroMeta, { borderTopColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="caption">Received</Text>
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      color: colors.credit,
                      marginTop: 2,
                      fontSize: 15,
                    }}
                  >
                    {formatINR(received)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="caption">Transactions</Text>
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      color: colors.text,
                      marginTop: 2,
                      fontSize: 15,
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
            <Text variant="title">Spending by category</Text>
            <Pressable
              onPress={() => router.push("/(app)/expenses")}
              hitSlop={8}
            >
              <Text
                style={{
                  fontFamily: typography.fontSansMedium,
                  color: colors.accentStrong,
                  fontSize: 14,
                }}
              >
                See all
              </Text>
            </Pressable>
          </View>

          <Card style={{ padding: spacing.lg }}>
            {categories.length === 0 ? (
              <Text muted style={{ textAlign: "center", paddingVertical: spacing.lg }}>
                No spending categories yet
              </Text>
            ) : (
              <View style={styles.catRow}>
                <DonutChart
                  slices={categories.map((c) => ({
                    value: c.amount,
                    color: c.color,
                  }))}
                  centerLabel="Total"
                  centerValue={formatINRCompact(spent)}
                />
                <View style={styles.legend}>
                  {categories.slice(0, 6).map((c) => (
                    <View key={c.key} style={styles.legendRow}>
                      <View
                        style={[styles.dot, { backgroundColor: c.color }]}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: typography.fontSans,
                          fontSize: 13,
                          color: colors.textSecondary,
                        }}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: typography.fontSansSemi,
                          fontSize: 13,
                          color: colors.text,
                        }}
                      >
                        {c.pct}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Card>
        </View>

        <View>
          <View style={styles.sectionHead}>
            <Text variant="title">This week</Text>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              {formatINR(weekSpent)} spent
            </Text>
          </View>
          <Card style={{ padding: spacing.lg }}>
            <WeekBars days={weekBars} />
          </Card>
        </View>

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
                  fontSize: 14,
                }}
              >
                See all
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text color={colors.danger} style={{ marginBottom: spacing.md }}>
              {error}
            </Text>
          ) : null}

          {!loading && recent.length === 0 ? (
            <EmptyState
              title="No expenses yet"
              body="Tap Add payments to import a PhonePe/GPay screenshot or enter one manually."
            />
          ) : (
            <Card style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
              {recent.map((e, i) => {
                const icon = categoryIcon(e.category?.slug);
                const chipColor = e.category?.color ?? colors.accent;
                return (
                  <View key={e.id}>
                    <Pressable
                      onPress={() => router.push(`/(app)/expenses/${e.id}`)}
                      style={({ pressed }) => [
                        styles.recentRow,
                        pressed && { backgroundColor: colors.bgMuted },
                      ]}
                    >
                      <View
                        style={[
                          styles.catChip,
                          { backgroundColor: `${chipColor}22` },
                        ]}
                      >
                        <Ionicons name={icon} size={18} color={chipColor} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: typography.fontSansSemi,
                            fontSize: 15,
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {e.merchant}
                        </Text>
                        <Text
                          muted
                          style={{ fontSize: 12, marginTop: 3 }}
                          numberOfLines={1}
                        >
                          {e.category?.name ??
                            (e.direction === "credit" ? "Income" : "Other")}
                          {" · "}
                          {formatRelativePaidAt(e.paidAt)}
                        </Text>
                      </View>
                      <Amount
                        amount={e.amount}
                        direction={e.direction}
                        size="sm"
                      />
                    </Pressable>
                    {i < recent.length - 1 ? (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                          backgroundColor: colors.border,
                          marginLeft: 56,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
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
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
  },
  monthBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  spentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  budgetTrack: {
    height: 5,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  budgetFill: {
    height: "100%",
    borderRadius: radius.pill,
    minWidth: 4,
  },
  heroMeta: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  catChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
