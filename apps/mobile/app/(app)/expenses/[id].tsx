import { Ionicons } from "@expo/vector-icons";
import type { Expense } from "@paymenttracker/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { CategoryChips } from "@/src/components/CategoryChips";
import { DateField } from "@/src/components/DateField";
import { SourceLogo } from "@/src/components/SourceLogo";
import { Amount, Button, Card, Input, Screen, Text } from "@/src/components/ui";
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
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(new Date());
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getExpense(String(id));
      setExpense(res.expense);
      setMerchant(res.expense.merchant);
      setAmount(res.expense.amount);
      setDirection(res.expense.direction);
      setNotes(res.expense.notes ?? "");
      setPaidAt(new Date(res.expense.paidAt));
      setCategoryId(res.expense.categoryId);
      setNotFound(false);
    } catch {
      setNotFound(true);
      setExpense(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const onSave = async () => {
    if (!merchant.trim() || !amount) {
      setError("Merchant and amount are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateExpense(String(id), {
        merchant: merchant.trim(),
        amount: String(amount).replace(/,/g, ""),
        direction,
        notes: notes.trim() || null,
        paidAt: paidAt.toISOString(),
        categoryId,
      });
      setExpense(res.expense);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const isCredit = expense?.direction === "credit";

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title={editing ? "Edit" : "Transaction"}
        subtitle={editing ? "Update fields" : "Payment details"}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing.xxxl,
            gap: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginTop: spacing.xxl }}
            />
          ) : notFound || !expense ? (
            <Card variant="soft" style={{ gap: spacing.md }}>
              <Text variant="subtitle">Not found</Text>
              <Text muted>This expense may have been deleted.</Text>
              <Button title="Go back" onPress={() => router.back()} />
            </Card>
          ) : editing ? (
            <>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Merchant</Text>
                <Input
                  value={merchant}
                  onChangeText={setMerchant}
                  style={{ backgroundColor: colors.bgMuted, borderWidth: 0 }}
                />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Amount (₹)</Text>
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: colors.bgMuted, borderWidth: 0 }}
                />
              </View>
              <View style={styles.dirRow}>
                {(["debit", "credit"] as const).map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDirection(d)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          direction === d ? colors.accent : colors.bgMuted,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: typography.fontSansSemi,
                        color: direction === d ? colors.accentOn : colors.text,
                      }}
                    >
                      {d === "debit" ? "Paid" : "Received"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <DateField value={paidAt} onChange={setPaidAt} />
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Category</Text>
                <CategoryChips value={categoryId} onChange={setCategoryId} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Notes</Text>
                <Input
                  value={notes}
                  onChangeText={setNotes}
                  style={{ backgroundColor: colors.bgMuted, borderWidth: 0 }}
                />
              </View>
              {error ? <Text color={colors.danger}>{error}</Text> : null}
              <Button
                title={saving ? "Saving…" : "Save changes"}
                loading={saving}
                onPress={onSave}
              />
              <Button
                title="Cancel"
                variant="ghost"
                disabled={saving}
                onPress={() => {
                  setEditing(false);
                  setError(null);
                  void load();
                }}
              />
            </>
          ) : (
            <>
              <Card
                variant="hero"
                style={[
                  styles.hero,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark
                      ? colors.bgElevated
                      : colors.heroWash,
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

              <Button title="Edit expense" onPress={() => setEditing(true)} />

              <Pressable
                onPress={onDelete}
                disabled={deleting}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  {
                    backgroundColor: colors.dangerSoft,
                    borderColor: isDark
                      ? "rgba(217,123,123,0.28)"
                      : "rgba(181,74,74,0.22)",
                    opacity: deleting ? 0.5 : pressed ? 0.88 : 1,
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
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
  hero: { gap: 0, padding: spacing.xl },
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
  detailBody: { flex: 1, minWidth: 0 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  },
  dirRow: { flexDirection: "row", gap: spacing.md },
  chip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
