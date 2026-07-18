import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ParsedExpense } from "@paymenttracker/shared";
import { ApiError, api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Input, Screen, Text } from "@/src/components/ui";
import { formatDateTime, formatExpenseAmount } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

type Row = ParsedExpense & { id: string };

function isJunk(item: ParsedExpense): boolean {
  const m = (item.merchant ?? "").trim();
  if (!item.amount) return true;
  if (!m || m.length < 3) return true;
  if (/^(zl|to|from|paid|na|n\/a|unknown)$/i.test(m)) return true;
  if ((item.confidence ?? 0) < 0.45) return true;
  return false;
}

function dayKey(iso: string | null | undefined) {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "unknown";
  }
}

export default function ImportSelectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    imageUri?: string;
    list?: string;
    rawText?: string;
  }>();

  const initialRows = useMemo(() => {
    try {
      const list = JSON.parse(String(params.list ?? "[]")) as ParsedExpense[];
      return list.map((item, i) => ({
        ...item,
        id: `row-${i}-${item.merchant}-${item.amount}`,
      }));
    } catch {
      return [] as Row[];
    }
  }, [params.list]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const r of initialRows) {
      init[r.id] = !isJunk(r);
    }
    return init;
  });
  const [editing, setEditing] = useState<Row | null>(null);
  const [editMerchant, setEditMerchant] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editDirection, setEditDirection] = useState<"debit" | "credit">(
    "debit"
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = rows.filter((r) => selected[r.id]).length;
  const selectedRows = rows.filter((r) => selected[r.id]);

  const toggle = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const selectAllGood = () => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.id] = !isJunk(r);
    setSelected(next);
  };

  const selectNone = () => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.id] = false;
    setSelected(next);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setEditMerchant(row.merchant ?? "");
    setEditAmount(row.amount ?? "");
    setEditPaidAt(row.paidAt ?? new Date().toISOString());
    setEditDirection(row.direction ?? "debit");
  };

  const saveEdit = () => {
    if (!editing) return;
    const amount = editAmount.replace(/,/g, "").trim();
    if (!editMerchant.trim() || !amount || Number(amount) <= 0) {
      Alert.alert("Check fields", "Merchant and a valid amount are required.");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? {
              ...r,
              merchant: editMerchant.trim(),
              amount: Number(amount).toFixed(2),
              paidAt: editPaidAt,
              direction: editDirection,
              warnings: [],
              confidence: Math.max(r.confidence ?? 0, 0.8),
            }
          : r
      )
    );
    setSelected((s) => ({ ...s, [editing.id]: true }));
    setEditing(null);
  };

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    setEditing((e) => (e?.id === id ? null : e));
  }, []);

  const addSelected = async () => {
    setError(null);
    setStatus(null);

    const batch = selectedRows.filter(
      (r) => r.merchant?.trim() && r.amount && Number(r.amount) > 0
    );

    if (batch.length === 0) {
      setError("Select at least one payment with merchant and amount.");
      return;
    }

    const keys = new Set<string>();
    const unique = batch.filter((r) => {
      const k = `${(r.merchant ?? "").trim().toLowerCase()}|${r.amount}|${dayKey(r.paidAt)}`;
      if (keys.has(k)) return false;
      keys.add(k);
      return true;
    });
    const clientDupes = batch.length - unique.length;

    setSaving(true);
    setStatus(
      clientDupes > 0
        ? `Saving ${unique.length}…`
        : `Saving ${unique.length}…`
    );

    try {
      const payload = unique.map((r) => ({
        merchant: (r.merchant ?? "").trim(),
        amount: String(r.amount).replace(/,/g, ""),
        direction: r.direction ?? "debit",
        paidAt: r.paidAt
          ? new Date(r.paidAt).toISOString()
          : new Date().toISOString(),
        source:
          r.source === "phonepe" || r.source === "gpay" ? r.source : "manual",
        upiRef: r.upiRef ?? null,
        notes: null,
        rawOcrText: r.rawText || params.rawText || null,
      }));

      const res = await api.createExpensesBatch(payload);

      const parts = [
        res.created > 0 ? `Added ${res.created}` : null,
        res.skipped > 0
          ? `skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}`
          : null,
        res.failed > 0 ? `${res.failed} failed` : null,
      ].filter(Boolean);

      Alert.alert(
        res.created > 0 ? "Import complete" : "Nothing new added",
        parts.join(" · ") || "No changes",
        [{ text: "OK", onPress: () => router.replace("/(app)") }]
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save payments"
      );
    } finally {
      setSaving(false);
      setStatus(null);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title={`${rows.length} detected`}
        subtitle="Select what to import"
        backTo="/(app)/import"
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.toolbar}>
          <Pressable onPress={selectAllGood} hitSlop={8}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 14,
                color: colors.accentStrong,
              }}
            >
              Select good
            </Text>
          </Pressable>
          <Text muted style={{ fontSize: 13 }}>
            ·
          </Text>
          <Pressable onPress={selectNone} hitSlop={8}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              Clear
            </Text>
          </Pressable>
          <Text
            muted
            style={{ marginLeft: "auto", fontSize: 13 }}
          >
            {selectedCount} of {rows.length}
          </Text>
        </View>

        {rows.length === 0 ? (
          <Text
            muted
            style={{ textAlign: "center", marginTop: spacing.xxxl }}
          >
            No payments left. Go back and try another screenshot.
          </Text>
        ) : (
          <View
            style={[
              styles.list,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.border,
              },
            ]}
          >
            {rows.map((row, index) => {
              const on = !!selected[row.id];
              const junk = isJunk(row);
              const isLast = index === rows.length - 1;
              return (
                <View key={row.id}>
                  <Pressable
                    onPress={() => toggle(row.id)}
                    onLongPress={() => openEdit(row)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: colors.bgMuted },
                      junk && !on && { opacity: 0.55 },
                    ]}
                  >
                    <View
                      style={[
                        styles.check,
                        {
                          borderColor: on
                            ? colors.text
                            : colors.borderStrong,
                          backgroundColor: on
                            ? colors.text
                            : "transparent",
                        },
                      ]}
                    >
                      {on ? (
                        <Text
                          style={{
                            color: colors.bg,
                            fontSize: 11,
                            fontFamily: typography.fontSansBold,
                            lineHeight: 13,
                          }}
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      style={styles.rowBody}
                      onPress={() => openEdit(row)}
                    >
                      <Text
                        style={{
                          fontFamily: typography.fontSansSemi,
                          fontSize: 15,
                          color: colors.text,
                        }}
                        numberOfLines={1}
                      >
                        {row.merchant || "Unknown"}
                      </Text>
                      <Text
                        muted
                        style={{ fontSize: 12, marginTop: 3 }}
                        numberOfLines={1}
                      >
                        {row.paidAt
                          ? formatDateTime(row.paidAt)
                          : "No date"}
                        {junk ? " · needs review" : ""}
                      </Text>
                    </Pressable>

                    <View style={styles.rowEnd}>
                      <Text
                        style={{
                          fontFamily: typography.fontSansSemi,
                          fontSize: 15,
                          color:
                            row.direction === "credit"
                              ? colors.credit
                              : colors.debit,
                        }}
                      >
                        {row.amount
                          ? formatExpenseAmount(row.amount, row.direction)
                          : "—"}
                      </Text>
                      <Pressable
                        onPress={() => removeRow(row.id)}
                        hitSlop={10}
                        style={{ marginTop: 6 }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textMuted,
                          }}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                  {!isLast ? (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: colors.border },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {error ? (
          <Text
            color={colors.danger}
            style={{ marginTop: spacing.lg, lineHeight: 20 }}
          >
            {error}
          </Text>
        ) : null}
        {status ? (
          <Text muted style={{ textAlign: "center", marginTop: spacing.md }}>
            {status}
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, spacing.md),
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Button
          title={
            saving
              ? "Adding…"
              : selectedCount === 0
                ? "Select payments"
                : `Add ${selectedCount}`
          }
          loading={saving}
          disabled={saving || selectedCount === 0}
          onPress={addSelected}
          style={{
            opacity: saving || selectedCount === 0 ? 0.5 : 1,
          }}
        />
      </View>

      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.bg,
                paddingBottom: Math.max(insets.bottom, spacing.xl),
              },
            ]}
          >
            <View
              style={[
                styles.modalHandle,
                { backgroundColor: colors.borderStrong },
              ]}
            />
            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 18,
                color: colors.text,
                marginBottom: spacing.xl,
              }}
            >
              Edit payment
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.lg }}
            >
              <Field label="Merchant">
                <Input
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  style={inputStyle(colors.bgMuted)}
                />
              </Field>
              <Field label="Amount (₹)">
                <Input
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  style={inputStyle(colors.bgMuted)}
                />
              </Field>
              <Field label="When">
                <Input
                  value={editPaidAt}
                  onChangeText={setEditPaidAt}
                  autoCapitalize="none"
                  style={inputStyle(colors.bgMuted)}
                />
              </Field>
              <View style={styles.dirRow}>
                <DirChip
                  label="Paid"
                  active={editDirection === "debit"}
                  onPress={() => setEditDirection("debit")}
                />
                <DirChip
                  label="Received"
                  active={editDirection === "credit"}
                  onPress={() => setEditDirection("credit")}
                />
              </View>
            </ScrollView>

            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <Button title="Save" onPress={saveEdit} />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setEditing(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Text
        style={{
          fontFamily: typography.fontSansMedium,
          fontSize: 13,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function DirChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.dirChip,
        {
          backgroundColor: active ? colors.accent : colors.bgMuted,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontSansSemi,
          fontSize: 14,
          color: active ? colors.accentOn : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function inputStyle(bg: string) {
  return {
    borderWidth: 0,
    backgroundColor: bg,
    borderRadius: radius.md,
    minHeight: 52,
  };
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  list: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowEnd: {
    alignItems: "flex-end",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 22 + spacing.md,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    maxHeight: "88%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  dirRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  dirChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
