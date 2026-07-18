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
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
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

  const goBackToImport = useCallback(() => {
    // Stable path — avoid broken stack "back" into half-parsed states
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/import");
    }
  }, [router]);

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

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    if (editing?.id === id) setEditing(null);
  };

  const addSelected = async () => {
    setError(null);
    setStatus(null);

    const batch = selectedRows.filter(
      (r) => r.merchant?.trim() && r.amount && Number(r.amount) > 0
    );

    if (batch.length === 0) {
      setError("Select at least one valid payment (with merchant + amount).");
      return;
    }

    // Client-side within-batch dedupe preview
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
        ? `Saving ${unique.length}… (skipped ${clientDupes} duplicate in list)`
        : `Saving ${unique.length} payment${unique.length === 1 ? "" : "s"}…`
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
        res.skipped > 0 ? `skipped ${res.skipped} duplicate${res.skipped === 1 ? "" : "s"}` : null,
        res.failed > 0 ? `${res.failed} failed` : null,
      ].filter(Boolean);

      Alert.alert(
        res.created > 0 ? "Import complete" : "Nothing new added",
        parts.join(" · ") || "No changes",
        [
          {
            text: "OK",
            onPress: () => router.replace("/(app)"),
          },
        ]
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
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.md,
          },
        ]}
      >
        <Pressable
          onPress={goBackToImport}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backChip,
            {
              backgroundColor: colors.bgMuted,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ fontFamily: typography.fontSansSemi, fontSize: 15 }}>
            ← Back
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {rows.length} detected
          </Text>
          <Text muted style={{ fontSize: 13 }}>
            Tap a row to edit · check to include
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 140,
          gap: spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.toolbar}>
          <Button title="All good" variant="chip" onPress={selectAllGood} />
          <Button title="None" variant="chip" onPress={selectNone} />
          <Text muted style={{ marginLeft: "auto", fontSize: 13 }}>
            {selectedCount} selected
          </Text>
        </View>

        {rows.length === 0 ? (
          <Card variant="soft">
            <Text muted style={{ textAlign: "center" }}>
              No payments left. Go back and try another screenshot.
            </Text>
          </Card>
        ) : null}

        {rows.map((row) => {
          const on = !!selected[row.id];
          const junk = isJunk(row);
          return (
            <View
              key={row.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: on ? colors.accent : colors.border,
                  borderWidth: on ? 1.5 : StyleSheet.hairlineWidth,
                  opacity: junk && !on ? 0.72 : 1,
                },
              ]}
            >
              <Pressable
                onPress={() => toggle(row.id)}
                hitSlop={8}
                style={[
                  styles.check,
                  {
                    borderColor: on ? colors.accent : colors.borderStrong,
                    backgroundColor: on ? colors.accent : "transparent",
                  },
                ]}
              >
                {on ? (
                  <Text
                    style={{
                      color: colors.accentOn,
                      fontSize: 13,
                      fontFamily: typography.fontSansBold,
                    }}
                  >
                    ✓
                  </Text>
                ) : null}
              </Pressable>

              <Pressable style={{ flex: 1, gap: 4 }} onPress={() => openEdit(row)}>
                <Text variant="subtitle" numberOfLines={2}>
                  {row.merchant || "Unknown merchant"}
                </Text>
                <Text variant="caption">
                  {row.paidAt ? formatDateTime(row.paidAt) : "No date"}
                  {junk ? " · needs edit" : ""}
                </Text>
                <Text
                  color={colors.accentStrong}
                  style={{ fontSize: 12, marginTop: 2 }}
                >
                  Tap to edit
                </Text>
              </Pressable>

              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <Text
                  style={{
                    fontFamily: typography.fontMonoSemi,
                    color:
                      row.direction === "credit" ? colors.credit : colors.debit,
                    fontSize: 16,
                  }}
                >
                  {row.amount
                    ? formatExpenseAmount(row.amount, row.direction)
                    : "—"}
                </Text>
                <Pressable onPress={() => removeRow(row.id)} hitSlop={8}>
                  <Text color={colors.textMuted} style={{ fontSize: 12 }}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {error ? (
          <Text color={colors.danger} style={{ lineHeight: 20 }}>
            {error}
          </Text>
        ) : null}
        {status ? (
          <Text muted style={{ textAlign: "center" }}>
            {status}
          </Text>
        ) : null}
      </ScrollView>

      {/* Sticky footer CTA */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, spacing.md),
            backgroundColor: isDark ? colors.bgElevated : colors.bgCard,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Button
          title={
            saving
              ? "Adding…"
              : selectedCount === 0
                ? "Select payments to add"
                : `Add ${selectedCount} payment${selectedCount === 1 ? "" : "s"}`
          }
          loading={saving}
          disabled={saving || selectedCount === 0}
          onPress={addSelected}
        />
        <Text muted style={{ textAlign: "center", fontSize: 11, marginTop: 8 }}>
          Duplicates (same merchant + amount on the same day) are skipped
        </Text>
      </View>

      {/* Edit modal */}
      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.bgElevated,
                paddingBottom: Math.max(insets.bottom, spacing.xl),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text variant="title" style={{ marginBottom: spacing.sm }}>
              Edit payment
            </Text>
            <Text muted style={{ marginBottom: spacing.lg }}>
              Fix OCR mistakes, then save changes to this row.
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md }}
            >
              <View style={{ gap: 6 }}>
                <Text variant="label">Merchant</Text>
                <Input value={editMerchant} onChangeText={setEditMerchant} />
              </View>
              <View style={{ gap: 6 }}>
                <Text variant="label">Amount (INR)</Text>
                <Input
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text variant="label">When (ISO date)</Text>
                <Input
                  value={editPaidAt}
                  onChangeText={setEditPaidAt}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.dirRow}>
                <Button
                  title="Paid"
                  variant={editDirection === "debit" ? "primary" : "ghost"}
                  onPress={() => setEditDirection("debit")}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Received"
                  variant={editDirection === "credit" ? "secondary" : "ghost"}
                  onPress={() => setEditDirection("credit")}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>

            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <Button title="Save changes" onPress={saveEdit} />
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

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  backChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
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
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.35)",
    marginBottom: spacing.lg,
  },
  dirRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
