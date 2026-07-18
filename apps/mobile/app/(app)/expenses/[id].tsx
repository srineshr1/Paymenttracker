import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Expense } from "@paymenttracker/shared";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import {
  Amount,
  Badge,
  Button,
  Card,
  Screen,
  Text,
} from "@/src/components/ui";
import { formatDateTime, sourceLabel } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing, typography } from "@/src/design/tokens";

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getExpense(String(id));
        setExpense(res.expense);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onDelete = () => {
    Alert.alert("Delete expense?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteExpense(String(id));
            router.back();
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Expense" subtitle="Details" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.lg,
        }}
      >
        {loading || !expense ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <View style={{ gap: spacing.sm }}>
              <Text variant="label">Merchant</Text>
              <Text variant="display" style={{ fontSize: 30 }}>
                {expense.merchant}
              </Text>
              <Amount
                amount={expense.amount}
                direction={expense.direction}
                size="lg"
              />
            </View>

            <Card variant="accent" style={styles.metaCard}>
              <Row label="When" value={formatDateTime(expense.paidAt)} />
              <Row label="Source" value={sourceLabel(expense.source)} />
              <Row
                label="Direction"
                value={expense.direction === "debit" ? "Paid" : "Received"}
              />
              {expense.upiRef ? (
                <Row label="UPI ref" value={expense.upiRef} />
              ) : null}
              {expense.category ? (
                <Row label="Category" value={expense.category.name} />
              ) : null}
              {expense.notes ? (
                <Row label="Notes" value={expense.notes} />
              ) : null}
            </Card>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Badge label={sourceLabel(expense.source)} tone="accent" />
              <Badge
                label={expense.direction}
                tone={expense.direction === "credit" ? "success" : "neutral"}
              />
            </View>

            <Button
              title="Delete expense"
              variant="danger"
              loading={deleting}
              onPress={onDelete}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption">{label}</Text>
      <Text
        style={{
          flex: 1,
          textAlign: "right",
          fontFamily: typography.fontSansMedium,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metaCard: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
});
