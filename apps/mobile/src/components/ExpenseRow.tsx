import { Ionicons } from "@expo/vector-icons";
import type { Expense } from "@paymenttracker/shared";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { formatDateTime } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { categoryIcon } from "@/src/features/categories/icons";
import { Amount, Text } from "./ui";

export function ExpenseRow({
  expense,
  onPress,
}: {
  expense: Expense;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const chipColor = expense.category?.color ?? colors.accent;
  const icon = categoryIcon(expense.category?.slug);
  const meta = formatDateTime(expense.paidAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: 0.88, backgroundColor: colors.bgMuted },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${chipColor}22` }]}>
        <Ionicons name={icon} size={20} color={chipColor} />
      </View>

      <View style={styles.mid}>
        <Text
          style={{
            fontFamily: typography.fontSansSemi,
            fontSize: 15,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {expense.merchant}
        </Text>
        <View style={styles.metaRow}>
          <Text muted style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {meta}
          </Text>
          {expense.category ? (
            <View
              style={[
                styles.catPill,
                {
                  backgroundColor: `${chipColor}1A`,
                  borderColor: `${chipColor}44`,
                },
              ]}
            >
              <View style={[styles.catDot, { backgroundColor: chipColor }]} />
              <Text
                style={{
                  fontFamily: typography.fontSansMedium,
                  fontSize: 11,
                  color: chipColor,
                }}
                numberOfLines={1}
              >
                {expense.category.name}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Amount amount={expense.amount} direction={expense.direction} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  mid: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 120,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
