import { Ionicons } from "@expo/vector-icons";
import type { Expense, MonthSummary } from "@paymenttracker/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { AddPaymentsMenu } from "@/src/components/AddPaymentsMenu";
import { BudgetSheet } from "@/src/components/BudgetSheet";
import { DonutChart } from "@/src/components/DonutChart";
import { Amount, Card, EmptyState, Screen, Text } from "@/src/components/ui";
import { WeekBars, type WeekDayBar } from "@/src/components/WeekBars";
import {
  type BudgetPlan,
  type BudgetPrefs,
  computeBudgetPlan,
  DEFAULT_BUDGET,
  DEFAULT_SAVINGS_RATE,
  getBudgetPrefs,
} from "@/src/data/budget";
import { getWallets, type WalletsState } from "@/src/data/cash";
import {
  formatINR,
  formatINRCompact,
  formatMonthShort,
  formatRelativePaidAt,
} from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";
import { categoryIcon } from "@/src/features/categories/icons";
import { syncAccountBalanceFromInbox } from "@/src/features/sms/syncBalance";

type CategorySlice = {
  key: string;
  name: string;
  color: string;
  amount: number;
  pct: number;
};

function startOfWeekMonday(d = new Date()) {
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(d: Date, n: number) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function weekRangeForOffset(offset: number) {
  const anchor = addDays(new Date(), offset * 7);
  const start = startOfWeekMonday(anchor);
  const end = endOfLocalDay(addDays(start, 6));
  return { start, end };
}

function formatWeekTitle(offset: number, start: Date, end: Date) {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]}`;
}

/** MoM spend change. Null when there’s no meaningful baseline. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function buildCategorySlices(expenses: Expense[]): CategorySlice[] {
  const debits = expenses.filter((e) => e.direction === "debit");
  const map = new Map<
    string,
    { name: string; color: string; amount: number }
  >();
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

function buildWeekBars(
  expenses: Expense[],
  weekStart: Date,
  weekOffset: number,
): WeekDayBar[] {
  const byDay = Array.from({ length: 7 }, () => 0);
  const startMs = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
  ).getTime();

  for (const e of expenses) {
    if (e.direction !== "debit") continue;
    const d = new Date(e.paidAt);
    if (Number.isNaN(d.getTime())) continue;
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const idx = Math.round((local.getTime() - startMs) / 86_400_000);
    if (idx < 0 || idx > 6) continue;
    byDay[idx] += Number(e.amount) || 0;
  }

  const today = new Date();
  const todayLocal = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const todayIdx = Math.round((todayLocal.getTime() - startMs) / 86_400_000);
  const isCurrentWeek = weekOffset === 0;

  return byDay.map((amount, dayIndex) => {
    const isFuture = isCurrentWeek && dayIndex > todayIdx;
    return {
      dayIndex,
      amount: isFuture ? 0 : amount,
      active: isCurrentWeek && dayIndex === todayIdx,
      empty: isFuture,
    };
  });
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
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last, …
  const weekOffsetRef = useRef(0);
  weekOffsetRef.current = weekOffset;
  const [recent, setRecent] = useState<Expense[]>([]);
  const [budgetPrefs, setBudgetPrefsState] = useState<BudgetPrefs>({
    mode: "auto",
    manualBudget: DEFAULT_BUDGET,
    savingsRate: DEFAULT_SAVINGS_RATE,
  });
  const [avgIncomeLast3, setAvgIncomeLast3] = useState(0);
  const [avgSpendLast3, setAvgSpendLast3] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletsState>({
    accountBalance: 0,
    cashBalance: 0,
    movements: [],
    accountBalanceAt: null,
    accountBalanceKnown: false,
  });
  const [showLeftToSpend, setShowLeftToSpend] = useState(false);

  const loadWeek = useCallback(async (offset: number) => {
    const { start, end } = weekRangeForOffset(offset);
    try {
      const weekList = await api.listExpenses({
        limit: 200,
        from: start.toISOString(),
        to: end.toISOString(),
      });
      setWeekExpenses(weekList.expenses);
    } catch {
      /* keep previous week data */
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const monthStart = new Date(cursor.year, cursor.month - 1, 1);
      const monthEnd = new Date(cursor.year, cursor.month, 0, 23, 59, 59, 999);
      const prev = new Date(cursor.year, cursor.month - 2, 1);
      const { start: weekStart, end: weekEnd } = weekRangeForOffset(
        weekOffsetRef.current,
      );

      // Last 3 complete-ish months before the cursor (for averages)
      const histMonths = [1, 2, 3].map((back) => {
        const d = new Date(cursor.year, cursor.month - 1 - back, 1);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      });

      // Refresh account balance from newest bank "Avl Bal" SMS (GPay/PhonePe-like)
      const balanceSync = syncAccountBalanceFromInbox().catch(() =>
        getWallets(),
      );

      const [
        s,
        prevS,
        monthList,
        weekList,
        recentList,
        prefs,
        walletState,
        ...hist
      ] = await Promise.all([
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
        getBudgetPrefs(),
        balanceSync,
        ...histMonths.map((m) => api.monthSummary(m.year, m.month)),
      ]);

      setWallets(walletState);

      let incomeSum = 0;
      let spendSum = 0;
      let incomeN = 0;
      let spendN = 0;
      for (const h of hist) {
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

      setSummary(s);
      setPrevSummary(prevS);
      setMonthExpenses(monthList.expenses);
      setWeekExpenses(weekList.expenses);
      setRecent(recentList.expenses);
      setBudgetPrefsState(prefs);
      setAvgIncomeLast3(incomeN > 0 ? incomeSum / incomeN : 0);
      setAvgSpendLast3(spendN > 0 ? spendSum / spendN : 0);
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
    }, [load]),
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

  const plan: BudgetPlan = useMemo(
    () =>
      computeBudgetPlan({
        incomeThisMonth: received,
        avgIncomeLast3,
        avgSpendLast3,
        spentThisMonth: spent,
        year: cursor.year,
        month: cursor.month,
        prefs: budgetPrefs,
      }),
    [
      received,
      avgIncomeLast3,
      avgSpendLast3,
      spent,
      cursor.year,
      cursor.month,
      budgetPrefs,
    ],
  );

  const budget = plan.budget;
  const budgetPct = budget > 0 ? Math.min(1.2, spent / budget) : 0;
  const barWidthPct = Math.min(100, Math.round(budgetPct * 100));
  const barColor =
    budgetPct > 1
      ? colors.danger
      : budgetPct > 0.8
        ? colors.warning
        : colors.accent;

  const autoBudgetPreview = useMemo(
    () =>
      computeBudgetPlan({
        incomeThisMonth: received,
        avgIncomeLast3,
        avgSpendLast3,
        spentThisMonth: spent,
        year: cursor.year,
        month: cursor.month,
        prefs: { ...budgetPrefs, mode: "auto" },
      }).budget,
    [
      received,
      avgIncomeLast3,
      avgSpendLast3,
      spent,
      cursor.year,
      cursor.month,
      budgetPrefs,
    ],
  );

  const budgetSourceLabel =
    plan.mode === "manual"
      ? "Custom"
      : plan.source === "income"
        ? `Smart · save ${Math.round(plan.savingsRate * 100)}%`
        : plan.source === "spend-avg"
          ? "Smart · from past spend"
          : plan.incomeIncomplete
            ? "Smart · estimate"
            : "Smart · default";

  const paceLabel = (() => {
    if (plan.paceDeltaPct == null) return null;
    const p = plan.paceDeltaPct;
    if (plan.isCurrentMonth) {
      if (Math.abs(p) <= 8)
        return { text: "On track this month", tone: "ok" as const };
      if (p > 0) {
        // Huge % usually means bad budget base — show ₹ over target instead
        if (p > 200 && plan.overBy > 0) {
          return {
            text: `${formatINR(plan.overBy)} over pace · slow down`,
            tone: "hot" as const,
          };
        }
        return {
          text: `${p}% over pace · slow down`,
          tone: "hot" as const,
        };
      }
      return {
        text: `${Math.abs(p)}% under pace`,
        tone: "cool" as const,
      };
    }
    if (p > 0) {
      if (p > 200 && plan.overBy > 0) {
        return {
          text: `Ended ${formatINR(plan.overBy)} over budget`,
          tone: "hot" as const,
        };
      }
      return { text: `Ended ${p}% over budget`, tone: "hot" as const };
    }
    if (p < 0)
      return {
        text: `Ended ${Math.abs(p)}% under budget`,
        tone: "cool" as const,
      };
    return { text: "Ended on budget", tone: "ok" as const };
  })();

  const categories = useMemo(
    () => buildCategorySlices(monthExpenses),
    [monthExpenses],
  );
  const weekRange = useMemo(
    () => weekRangeForOffset(weekOffset),
    [weekOffset],
  );
  const weekBars = useMemo(
    () => buildWeekBars(weekExpenses, weekRange.start, weekOffset),
    [weekExpenses, weekRange.start, weekOffset],
  );
  const weekSpent = weekBars.reduce((s, d) => s + d.amount, 0);
  const weekTitle = formatWeekTitle(
    weekOffset,
    weekRange.start,
    weekRange.end,
  );

  const shiftWeek = useCallback((delta: number) => {
    setWeekOffset((prev) => {
      const next = prev + delta;
      // Don't allow weeks after the current one
      if (next > 0) return prev;
      // Cap how far back we go (about a year)
      if (next < -52) return prev;
      return next;
    });
  }, []);

  // Load week series when the user swipes / taps arrows (not on first paint — load() covers that)
  const weekBoot = useRef(true);
  useEffect(() => {
    if (weekBoot.current) {
      weekBoot.current = false;
      return;
    }
    void loadWeek(weekOffset);
  }, [weekOffset, loadWeek]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          // Clear the floating Add payments control
          paddingBottom: insets.bottom + 160,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.md }}>
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
              numberOfLines={1}
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
                backgroundColor: colors.bgElevated,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <Card variant="hero" style={styles.heroCard}>
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={10}
              style={styles.monthBtn}
              accessibilityLabel="Previous month"
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: typography.fontSansSemi,
                fontSize: 12,
                letterSpacing: 1.1,
                color: colors.textSecondary,
              }}
            >
              {formatMonthShort(cursor.year, cursor.month)}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={10}
              style={styles.monthBtn}
              accessibilityLabel="Next month"
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
              <View style={styles.spentBlock}>
                <View style={styles.spentCol}>
                  <View style={styles.spentRow}>
                    <Text
                      style={{
                        fontFamily: typography.fontSansBold,
                        fontSize: 36,
                        lineHeight: 42,
                        letterSpacing: -0.5,
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
                              change > 0
                                ? "rgba(217,123,123,0.14)"
                                : change < 0
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
                          color={
                            change > 0
                              ? colors.danger
                              : change < 0
                                ? colors.credit
                                : colors.textSecondary
                          }
                        />
                        <Text
                          style={{
                            fontFamily: typography.fontSansSemi,
                            fontSize: 11,
                            color:
                              change > 0
                                ? colors.danger
                                : change < 0
                                  ? colors.credit
                                  : colors.textSecondary,
                          }}
                        >
                          {Math.abs(change)}%
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text muted style={{ fontSize: 13, marginTop: 2 }}>
                    Spent this month
                  </Text>
                </View>

                <View style={styles.leftToSpendCol}>
                  <View style={styles.leftToSpendLabelRow}>
                    <Text
                      muted
                      style={{
                        fontSize: 13,
                        textAlign: "right",
                      }}
                    >
                      Balance
                    </Text>
                    <Pressable
                      onPress={() => setShowLeftToSpend((v) => !v)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showLeftToSpend
                          ? "Hide account balance"
                          : "Show account balance"
                      }
                      style={({ pressed }) => [
                        styles.eyeBtn,
                        {
                          backgroundColor: colors.bgMuted,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          showLeftToSpend ? "eye-outline" : "eye-off-outline"
                        }
                        size={14}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      fontFamily: typography.fontSansBold,
                      fontSize: 22,
                      lineHeight: 28,
                      letterSpacing: -0.4,
                      color: showLeftToSpend ? colors.text : colors.textMuted,
                      textAlign: "right",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {showLeftToSpend
                      ? formatINR(wallets.accountBalance)
                      : "••••••"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setBudgetOpen(true)}
                style={styles.budgetBlock}
                accessibilityRole="button"
                accessibilityLabel="Edit monthly budget"
              >
                <View style={styles.budgetRow}>
                  <View style={styles.budgetTitleRow}>
                    <Text
                      style={{
                        fontFamily: typography.fontSansMedium,
                        fontSize: 12,
                        color: colors.textSecondary,
                        flexShrink: 1,
                      }}
                      numberOfLines={1}
                    >
                      Budget · {budgetSourceLabel}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={colors.textMuted}
                    />
                  </View>
                  <Text
                    style={{
                      fontFamily: typography.fontSansMedium,
                      fontSize: 12,
                      color: colors.textSecondary,
                      flexShrink: 0,
                    }}
                    numberOfLines={1}
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
                        width: `${barWidthPct}%` as const,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
              </Pressable>

              {paceLabel ? (
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 12,
                    textAlign: "center",
                    color:
                      paceLabel.tone === "hot"
                        ? colors.danger
                        : paceLabel.tone === "cool"
                          ? colors.credit
                          : colors.textSecondary,
                  }}
                  numberOfLines={1}
                >
                  {paceLabel.text}
                </Text>
              ) : null}

              <View
                style={[styles.heroStats, { borderTopColor: colors.border }]}
              >
                <View style={styles.statCol}>
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={styles.statLabel}
                  >
                    Received
                  </Text>
                  <Text
                    style={[styles.statValue, { color: colors.credit }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {formatINR(received)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.statCol}>
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={styles.statLabel}
                  >
                    Net
                  </Text>
                  <Text
                    style={[
                      styles.statValue,
                      {
                        color: plan.net >= 0 ? colors.credit : colors.danger,
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {plan.net >= 0 ? "+" : "−"}
                    {formatINR(Math.abs(plan.net))}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View style={styles.statCol}>
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={styles.statLabel}
                  >
                    Txns
                  </Text>
                  <Text
                    style={[styles.statValue, { color: colors.text }]}
                    numberOfLines={1}
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
              <Text
                muted
                style={{ textAlign: "center", paddingVertical: spacing.lg }}
              >
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
                    <Pressable
                      key={c.key}
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/expenses",
                          params: { slug: c.key },
                        })
                      }
                      style={({ pressed }) => [
                        styles.legendRow,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
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
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </Card>
        </View>

        <View>
          <View style={styles.sectionHead}>
            <Text variant="title">{weekTitle}</Text>
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
            <WeekBars
              days={weekBars}
              onPrevWeek={() => shiftWeek(-1)}
              onNextWeek={() => shiftWeek(1)}
              canGoPrev={weekOffset > -52}
              canGoNext={weekOffset < 0}
            />
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
            <Card
              style={{
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.sm,
              }}
            >
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

      <BudgetSheet
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        prefs={budgetPrefs}
        autoBudgetPreview={autoBudgetPreview}
        onSaved={(next) => {
          setBudgetPrefsState(next);
        }}
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
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    gap: spacing.md,
    padding: spacing.lg,
    overflow: "hidden",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: -spacing.xs,
  },
  monthBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  spentBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  spentCol: {
    flex: 1,
    minWidth: 0,
  },
  spentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  leftToSpendCol: {
    flexShrink: 1,
    maxWidth: "48%",
    alignItems: "flex-end",
  },
  leftToSpendLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eyeBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  budgetBlock: {
    gap: 8,
  },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  budgetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  budgetTrack: {
    height: 4,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  budgetFill: {
    height: "100%",
    borderRadius: radius.xs,
    minWidth: 4,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2,
  },
  statLabel: {
    textAlign: "center",
    width: "100%",
  },
  statValue: {
    fontFamily: typography.fontSansSemi,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
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
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
