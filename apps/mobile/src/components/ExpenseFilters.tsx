/**
 * Search + filter controls for the expense timeline.
 * Purely presentational: owns no data, only reports filter state upward.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Direction, ExpenseSource } from "@paymenttracker/shared";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Input, Text } from "@/src/components/ui";
import { sourceLabel } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

export type DateRangeKey = "all" | "7d" | "30d" | "month" | "year";

export type ExpenseFilterState = {
  sources: ExpenseSource[];
  direction: Direction | "all";
  range: DateRangeKey;
};

export const EMPTY_EXPENSE_FILTERS: ExpenseFilterState = {
  sources: [],
  direction: "all",
  range: "all",
};

const SOURCE_OPTIONS: ExpenseSource[] = [
  "phonepe",
  "gpay",
  "upi",
  "sms",
  "manual",
  "cash",
];

const RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "all", label: "Any time" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

/** Count of non-default filter dimensions, for the toggle badge. */
export function activeFilterCount(
  state: ExpenseFilterState,
  extra?: { category?: boolean },
): number {
  let n = 0;
  if (state.sources.length) n += 1;
  if (state.direction !== "all") n += 1;
  if (state.range !== "all") n += 1;
  if (extra?.category) n += 1;
  return n;
}

/** Resolve a range key to ISO bounds for `listExpenses`. */
export function rangeToBounds(range: DateRangeKey): {
  from?: string;
  to?: string;
} {
  if (range === "all") return {};
  const now = new Date();
  if (range === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    };
  }
  if (range === "year") {
    return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
  }
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString() };
}

export function ExpenseSearchBar({
  value,
  onChangeText,
  onToggleFilters,
  filtersOpen,
  activeCount,
  onClear,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
  activeCount: number;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const showClear = activeCount > 0 || value.length > 0;

  return (
    <View style={styles.searchRow}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Input
          value={value}
          onChangeText={onChangeText}
          placeholder="Search merchant, note or amount…"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search expenses"
          style={{
            backgroundColor: colors.bgMuted,
            borderWidth: 0,
            minHeight: 48,
            paddingRight: value ? 40 : undefined,
          }}
        />
        {value ? (
          <Pressable
            onPress={() => onChangeText("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search text"
            style={styles.inlineClear}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onToggleFilters}
        accessibilityRole="button"
        accessibilityLabel="Toggle filters"
        accessibilityState={{ expanded: filtersOpen }}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            backgroundColor:
              filtersOpen || activeCount > 0
                ? colors.accentSoft
                : colors.bgMuted,
            borderColor:
              filtersOpen || activeCount > 0 ? colors.accent : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons
          name="options-outline"
          size={20}
          color={activeCount > 0 ? colors.accent : colors.textSecondary}
        />
        {activeCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 10,
                color: colors.accentOn,
              }}
            >
              {activeCount}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {showClear ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search and filters"
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.bgMuted,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ExpenseFilterPanel({
  state,
  onChange,
}: {
  state: ExpenseFilterState;
  onChange: (next: ExpenseFilterState) => void;
}) {
  const { colors } = useTheme();

  const toggleSource = (source: ExpenseSource) => {
    const has = state.sources.includes(source);
    onChange({
      ...state,
      sources: has
        ? state.sources.filter((s) => s !== source)
        : [...state.sources, source],
    });
  };

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
      ]}
    >
      <FilterGroup label="Direction">
        <Pill
          label="All"
          active={state.direction === "all"}
          onPress={() => onChange({ ...state, direction: "all" })}
        />
        <Pill
          label="Paid"
          active={state.direction === "debit"}
          tint={colors.debit}
          onPress={() => onChange({ ...state, direction: "debit" })}
        />
        <Pill
          label="Received"
          active={state.direction === "credit"}
          tint={colors.credit}
          onPress={() => onChange({ ...state, direction: "credit" })}
        />
      </FilterGroup>

      <FilterGroup label="Source" scroll>
        {SOURCE_OPTIONS.map((s) => (
          <Pill
            key={s}
            label={sourceLabel(s)}
            active={state.sources.includes(s)}
            onPress={() => toggleSource(s)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="When" scroll>
        {RANGE_OPTIONS.map((r) => (
          <Pill
            key={r.key}
            label={r.label}
            active={state.range === r.key}
            onPress={() => onChange({ ...state, range: r.key })}
          />
        ))}
      </FilterGroup>
    </View>
  );
}

function FilterGroup({
  label,
  children,
  scroll,
}: {
  label: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption">{label}</Text>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillScroll}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.pillRow}>{children}</View>
      )}
    </View>
  );
}

function Pill({
  label,
  active,
  tint,
  onPress,
}: {
  label: string;
  active: boolean;
  tint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = tint ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? `${color}26` : colors.bgMuted,
          borderColor: active ? color : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: active ? typography.fontSansSemi : typography.fontSans,
          fontSize: 13,
          color: active ? colors.text : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inlineClear: {
    position: "absolute",
    right: 12,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    marginTop: spacing.md,
    padding: spacing.lg,
    gap: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pillScroll: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
