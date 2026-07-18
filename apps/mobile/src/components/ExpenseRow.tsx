import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Expense } from "@paymenttracker/shared";
import { Amount, Text } from "./ui";
import { formatDateTime } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing } from "@/src/design/tokens";

export function ExpenseRow({
  expense,
  onPress,
}: {
  expense: Expense;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: 0.85, backgroundColor: colors.bgMuted },
      ]}
    >
      <View style={styles.mid}>
        <Text variant="subtitle" numberOfLines={1}>
          {expense.merchant}
        </Text>
        <Text variant="caption">{formatDateTime(expense.paidAt)}</Text>
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
  mid: {
    flex: 1,
    gap: 4,
  },
});
