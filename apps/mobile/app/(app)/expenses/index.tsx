import { Ionicons } from "@expo/vector-icons";
import type { Category, Expense } from "@paymenttracker/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { ExpenseRow } from "@/src/components/ExpenseRow";
import { EmptyState, Input, Screen, Text } from "@/src/components/ui";
import { formatINR, formatINRCompact } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { categoryIcon } from "@/src/features/categories/icons";

type FilterKey = "all" | "uncategorized" | string; // string = category id

type CatStat = {
  id: string;
  name: string;
  slug: string;
  color: string;
  count: number;
  debitTotal: number;
};

export default function ExpensesListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ category?: string; slug?: string }>();

  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [filterSeeded, setFilterSeeded] = useState(false);

  const load = useCallback(async (query?: string) => {
    setError(null);
    try {
      const [expRes, catRes] = await Promise.all([
        api.listExpenses({
          limit: 200,
          q: query?.trim() || undefined,
        }),
        api.listCategories(),
      ]);
      setItems(expRes.expenses);
      setCategories(catRes.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Deep-link from home donut / legend
  useFocusEffect(
    useCallback(() => {
      if (filterSeeded) return;
      const slug = typeof params.slug === "string" ? params.slug : "";
      const catId = typeof params.category === "string" ? params.category : "";
      if (slug === "uncategorized") {
        setFilter("uncategorized");
        setFilterSeeded(true);
      } else if (catId) {
        setFilter(catId);
        setFilterSeeded(true);
      } else if (slug) {
        // Resolve after categories load
        setFilterSeeded(true);
      }
    }, [params.category, params.slug, filterSeeded]),
  );

  // Resolve slug → id once categories arrive
  useEffect(() => {
    const slug = typeof params.slug === "string" ? params.slug : "";
    if (!slug || slug === "uncategorized" || !categories.length) return;
    const match = categories.find((c) => c.slug === slug);
    if (match) setFilter(match.id);
  }, [params.slug, categories]);

  useFocusEffect(
    useCallback(() => {
      const ready = requestAnimationFrame(() => {
        void load(q);
      });
      return () => cancelAnimationFrame(ready);
    }, [load, q]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load(q);
  };

  const debouncedSearch = useMemo(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    return (text: string) => {
      setQ(text);
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(text), 280);
    };
  }, [load]);

  const catStats: CatStat[] = useMemo(() => {
    const map = new Map<string, CatStat>();
    for (const c of categories) {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        count: 0,
        debitTotal: 0,
      });
    }
    for (const e of items) {
      if (!e.categoryId || !e.category) continue;
      const row = map.get(e.categoryId);
      if (!row) continue;
      row.count += 1;
      if (e.direction === "debit") {
        row.debitTotal += Number(e.amount) || 0;
      }
    }
    return [...map.values()]
      .filter((c) => c.count > 0)
      .sort((a, b) => b.debitTotal - a.debitTotal || b.count - a.count);
  }, [categories, items]);

  const uncategorizedCount = useMemo(
    () => items.filter((e) => !e.categoryId).length,
    [items],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "uncategorized") {
      return items.filter((e) => !e.categoryId);
    }
    return items.filter((e) => e.categoryId === filter);
  }, [items, filter]);

  const filterSummary = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const e of filtered) {
      const n = Number(e.amount) || 0;
      if (e.direction === "credit") credit += n;
      else debit += n;
    }
    return { debit, credit, count: filtered.length };
  }, [filtered]);

  const activeCat =
    filter !== "all" && filter !== "uncategorized"
      ? (categories.find((c) => c.id === filter) ??
        catStats.find((c) => c.id === filter))
      : null;

  const headerTitle =
    filter === "all"
      ? "Activity"
      : filter === "uncategorized"
        ? "Uncategorized"
        : (activeCat?.name ?? "Activity");

  const headerSubtitle =
    filter === "all"
      ? "Search & browse on this device"
      : `${filterSummary.count} payment${filterSummary.count === 1 ? "" : "s"}`;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title={headerTitle} subtitle={headerSubtitle} />

      <View style={{ paddingHorizontal: spacing.xl }}>
        <Input
          value={q}
          onChangeText={debouncedSearch}
          placeholder="Search merchant…"
          autoCorrect={false}
          style={{
            backgroundColor: colors.bgMuted,
            borderWidth: 0,
            minHeight: 48,
          }}
        />
        {error ? (
          <Text color={colors.danger} style={{ marginTop: spacing.sm }}>
            {error}
          </Text>
        ) : null}
      </View>

      {/* Category filter rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRail}
        style={{ flexGrow: 0, marginTop: spacing.md }}
      >
        <FilterChip
          label="All"
          icon="apps-outline"
          color={colors.accent}
          count={items.length}
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        {catStats.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            icon={categoryIcon(c.slug)}
            color={c.color}
            count={c.count}
            amount={
              c.debitTotal > 0 ? formatINRCompact(c.debitTotal) : undefined
            }
            active={filter === c.id}
            onPress={() => setFilter(c.id)}
          />
        ))}
        {uncategorizedCount > 0 ? (
          <FilterChip
            label="None"
            icon="help-circle-outline"
            color={colors.textMuted}
            count={uncategorizedCount}
            active={filter === "uncategorized"}
            onPress={() => setFilter("uncategorized")}
          />
        ) : null}
      </ScrollView>

      {/* Active filter summary card */}
      {filter !== "all" && !loading ? (
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                {
                  backgroundColor: `${activeCat?.color ?? colors.accent}22`,
                },
              ]}
            >
              <Ionicons
                name={
                  filter === "uncategorized"
                    ? "help-circle-outline"
                    : categoryIcon(activeCat?.slug)
                }
                size={22}
                color={activeCat?.color ?? colors.accent}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: typography.fontSansSemi,
                  fontSize: 16,
                  color: colors.text,
                }}
              >
                {headerTitle}
              </Text>
              <Text muted style={{ fontSize: 12, marginTop: 2 }}>
                {filterSummary.count} txn
                {filterSummary.count === 1 ? "" : "s"}
                {filterSummary.debit > 0
                  ? ` · ${formatINR(filterSummary.debit)} spent`
                  : ""}
                {filterSummary.credit > 0
                  ? ` · ${formatINR(filterSummary.credit)} in`
                  : ""}
              </Text>
            </View>
            {filter !== "all" ? (
              <Pressable
                onPress={() => setFilter("all")}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.clearBtn,
                  {
                    backgroundColor: colors.bgMuted,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + 100,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.border,
                marginLeft: 56,
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={q.trim() ? "No matches" : "Nothing here yet"}
              body={
                q.trim()
                  ? "Try a different search or category."
                  : filter !== "all"
                    ? "No payments in this category."
                    : "Imported and manual expenses will show up in this timeline."
              }
            />
          }
          renderItem={({ item }) => (
            <ExpenseRow
              expense={item}
              onPress={() => router.push(`/(app)/expenses/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function FilterChip({
  label,
  icon,
  color,
  count,
  amount,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  count: number;
  amount?: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: active ? `${color}28` : colors.bgCard,
          borderColor: active ? color : colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.filterIcon,
          { backgroundColor: active ? `${color}33` : colors.bgMuted },
        ]}
      >
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={{ minWidth: 0 }}>
        <Text
          style={{
            fontFamily: typography.fontSansSemi,
            fontSize: 13,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text muted style={{ fontSize: 11, marginTop: 1 }} numberOfLines={1}>
          {amount ? `${amount} · ${count}` : `${count}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterRail: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: 2,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 108,
  },
  filterIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
