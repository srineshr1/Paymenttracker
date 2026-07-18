import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Expense } from "@paymenttracker/shared";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { SourceLogo } from "@/src/components/SourceLogo";
import { Amount, Card, Screen, Text } from "@/src/components/ui";
import { formatDateTime, sourceLabel } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
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

  const isCredit = expense?.direction === "credit";

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Transaction" subtitle="Payment details" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading || !expense ? (
          <ActivityIndicator
            color={colors.accent}
            style={{ marginTop: spacing.xxl }}
          />
        ) : (
          <>
            {/* Hero */}
            <Card
              variant="hero"
              style={[
                styles.hero,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? colors.bgElevated : colors.heroWash,
                },
              ]}
            >
              <View style={styles.heroTop}>
                <SourceLogo source={expense.source} size={52} />
                <View
                  style={[
                    styles.directionChip,
                    {
                      backgroundColor: isCredit
                        ? "rgba(143,203,176,0.16)"
                        : colors.dangerSoft,
                    },
                  ]}
                >
                  <Ionicons
                    name={isCredit ? "arrow-down" : "arrow-up"}
                    size={14}
                    color={isCredit ? colors.credit : colors.debit}
                  />
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      fontSize: 12,
                      color: isCredit ? colors.credit : colors.debit,
                      letterSpacing: 0.3,
                    }}
                  >
                    {isCredit ? "Received" : "Paid"}
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  fontFamily: typography.fontDisplayBold,
                  fontSize: 28,
                  lineHeight: 34,
                  letterSpacing: -0.6,
                  color: colors.text,
                  marginTop: spacing.lg,
                }}
                numberOfLines={2}
              >
                {expense.merchant}
              </Text>

              <Amount
                amount={expense.amount}
                direction={expense.direction}
                size="hero"
              />

              <Text muted style={{ marginTop: spacing.sm, fontSize: 14 }}>
                {formatDateTime(expense.paidAt)}
              </Text>
            </Card>

            {/* Details */}
            <View style={{ gap: spacing.sm }}>
              <Text variant="label" style={{ marginLeft: 4 }}>
                Details
              </Text>
              <Card variant="elevated" style={styles.detailCard}>
                <DetailRow
                  icon="wallet-outline"
                  label="Source"
                  value={sourceLabel(expense.source)}
                />
                <Divider />
                <DetailRow
                  icon={isCredit ? "arrow-down-outline" : "arrow-up-outline"}
                  label="Direction"
                  value={isCredit ? "Money in" : "Money out"}
                  valueColor={isCredit ? colors.credit : colors.debit}
                />
                <Divider />
                <DetailRow
                  icon="calendar-outline"
                  label="When"
                  value={formatDateTime(expense.paidAt)}
                />
                {expense.category ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="pricetag-outline"
                      label="Category"
                      value={expense.category.name}
                      swatch={expense.category.color}
                    />
                  </>
                ) : null}
                {expense.upiRef ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="key-outline"
                      label="UPI ref"
                      value={expense.upiRef}
                      mono
                    />
                  </>
                ) : null}
                {expense.notes ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="document-text-outline"
                      label="Notes"
                      value={expense.notes}
                      multiline
                    />
                  </>
                ) : null}
              </Card>
            </View>

            {/* Delete */}
            <Pressable
              onPress={onDelete}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete expense"
              style={({ pressed }) => [
                styles.deleteBtn,
                {
                  backgroundColor: colors.dangerSoft,
                  borderColor: isDark
                    ? "rgba(217,123,123,0.28)"
                    : "rgba(181,74,74,0.22)",
                  opacity: deleting ? 0.5 : pressed ? 0.88 : 1,
                  transform: [{ scale: pressed && !deleting ? 0.98 : 1 }],
                },
              ]}
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.danger}
                  />
                  <Text
                    style={{
                      fontFamily: typography.fontSansSemi,
                      fontSize: 15,
                      color: colors.danger,
                    }}
                  >
                    Delete expense
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Divider() {
  const { colors } = useTheme();
  return (
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
  );
}

function DetailRow({
  icon,
  label,
  value,
  valueColor,
  mono,
  multiline,
  swatch,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  multiline?: boolean;
  swatch?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.detailRow, multiline && { alignItems: "flex-start" }]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.bgMuted, borderColor: colors.border },
        ]}
      >
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.detailBody}>
        <Text variant="caption" style={{ marginBottom: 2 }}>
          {label}
        </Text>
        <View style={styles.valueRow}>
          {swatch ? (
            <View style={[styles.swatch, { backgroundColor: swatch }]} />
          ) : null}
          <Text
            style={{
              flex: 1,
              fontFamily: mono
                ? typography.fontMonoMed
                : typography.fontSansMedium,
              fontSize: mono ? 13 : 15,
              color: valueColor ?? colors.text,
              lineHeight: multiline ? 21 : undefined,
            }}
          >
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 0,
    padding: spacing.xl,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  directionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  detailCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 0,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  detailBody: {
    flex: 1,
    minWidth: 0,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36 + spacing.md + spacing.sm,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
});
