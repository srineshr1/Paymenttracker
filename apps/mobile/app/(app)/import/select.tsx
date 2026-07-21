import type { ParsedExpense } from "@paymenttracker/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { DateField } from "@/src/components/DateField";
import { Button, Input, Screen, Text } from "@/src/components/ui";
import { applyPaymentToAccount } from "@/src/data/cash";
import { saveExpenseChunks } from "@/src/data/expenseChunks";
import { formatDateTime, formatExpenseAmount } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import {
  dayKey,
  isJunk,
  resolveMerchant,
  safePaidAtIso,
} from "@/src/features/sms/quality";

type Row = ParsedExpense & { id: string; notes?: string | null };

function sanitizeAmountInput(raw: string): string {
  let next = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac = ""] = next.split(".");
    next = `${whole}.${frac.slice(0, 2)}`;
  }
  if (next.length > 1 && next.startsWith("0") && next[1] !== ".") {
    next = next.replace(/^0+/, "") || "0";
  }
  return next;
}

function parsePaidAt(iso: string | null | undefined): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export default function ImportSelectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
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
  const [editPaidAt, setEditPaidAt] = useState(() => new Date());
  const [editDirection, setEditDirection] = useState<"debit" | "credit">(
    "debit",
  );
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = rows.filter((r) => selected[r.id]).length;
  const selectedRows = rows.filter((r) => selected[r.id]);
  const isEditing = !!editing;

  const closeEdit = useCallback(() => setEditing(null), []);

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
    setEditPaidAt(parsePaidAt(row.paidAt));
    setEditDirection(row.direction ?? "debit");
    setEditNotes(row.notes ?? "");
  };

  const saveEdit = () => {
    if (!editing) return;
    const amount = sanitizeAmountInput(editAmount);
    const n = Number(amount);
    if (!editMerchant.trim() || !amount || !Number.isFinite(n) || n <= 0) {
      Alert.alert("Check fields", "Merchant and a valid amount are required.");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? {
              ...r,
              merchant: editMerchant.trim(),
              amount: n.toFixed(2),
              paidAt: editPaidAt.toISOString(),
              direction: editDirection,
              notes: editNotes.trim() || null,
              warnings: [],
              confidence: Math.max(r.confidence ?? 0, 0.8),
            }
          : r,
      ),
    );
    setSelected((s) => ({ ...s, [editing.id]: true }));
    setEditing(null);
  };

  const addSelected = async () => {
    setError(null);
    setStatus(null);

    const batch = selectedRows.filter(
      (r) => r.merchant?.trim() && r.amount && Number(r.amount) > 0,
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
      clientDupes > 0 ? `Saving ${unique.length}…` : `Saving ${unique.length}…`,
    );

    try {
      const payload = unique.map((r) => ({
        merchant: resolveMerchant(r),
        amount: String(r.amount).replace(/,/g, ""),
        direction: r.direction ?? "debit",
        paidAt: safePaidAtIso(r.paidAt),
        source:
          r.source === "phonepe" ||
          r.source === "gpay" ||
          r.source === "upi" ||
          r.source === "sms"
            ? r.source
            : "upi",
        upiRef: r.upiRef ?? null,
        notes: r.notes?.trim() || null,
        rawOcrText: r.rawText || params.rawText || null,
      }));

      const batchRes = await saveExpenseChunks(
        payload,
        (chunk) => api.createExpensesBatch(chunk),
        {
          onProgress: (msg) => setStatus(msg.replace(/^Importing/, "Saving")),
          yieldBetween: true,
        },
      );
      const { created, skipped, failed, partial, error: chunkError } = batchRes;

      // Newest absolute bank balance from this batch (if any SMS include Avl Bal)
      const withBal = unique
        .filter((r) => r.availableBalance)
        .sort((a, b) => {
          const ta = a.paidAt ? Date.parse(a.paidAt) : 0;
          const tb = b.paidAt ? Date.parse(b.paidAt) : 0;
          return tb - ta;
        });
      if (withBal[0]?.availableBalance && withBal[0].amount) {
        try {
          await applyPaymentToAccount({
            amount: withBal[0].amount,
            direction: withBal[0].direction ?? "debit",
            paidAt: withBal[0].paidAt,
            availableBalance: withBal[0].availableBalance,
          });
        } catch {
          /* best-effort */
        }
      }

      if (
        chunkError &&
        !partial &&
        created === 0 &&
        skipped === 0 &&
        failed === 0
      ) {
        throw chunkError;
      }

      const parts = [
        created > 0 ? `Added ${created}` : null,
        skipped > 0
          ? `skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`
          : null,
        failed > 0 ? `${failed} failed` : null,
        partial || chunkError ? "stopped early (partial save)" : null,
      ].filter(Boolean);

      Alert.alert(
        partial || chunkError
          ? "Import partially complete"
          : created > 0
            ? "Import complete"
            : "Nothing new added",
        parts.join(" · ") || "No changes",
        [{ text: "OK", onPress: () => router.replace("/(app)") }],
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save payments",
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
          <Text muted style={{ marginLeft: "auto", fontSize: 13 }}>
            {selectedCount} of {rows.length}
          </Text>
        </View>

        {rows.length === 0 ? (
          <Text muted style={{ textAlign: "center", marginTop: spacing.xxxl }}>
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
                  <View style={[styles.row, junk && !on && { opacity: 0.55 }]}>
                    <Pressable
                      onPress={() => toggle(row.id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={styles.checkHit}
                    >
                      <View
                        style={[
                          styles.check,
                          {
                            borderColor: on ? colors.text : colors.borderStrong,
                            backgroundColor: on ? colors.text : "transparent",
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
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.rowMain,
                        pressed && { backgroundColor: colors.bgMuted },
                      ]}
                      onPress={() => openEdit(row)}
                    >
                      <View style={styles.rowBody}>
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
                          {row.paidAt ? formatDateTime(row.paidAt) : "No date"}
                          {junk ? " · needs review" : ""}
                        </Text>
                      </View>

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
                    </Pressable>
                  </View>
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

      {!isEditing ? (
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
      ) : null}

      <Modal
        visible={isEditing}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
            onPress={closeEdit}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
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
            <View style={styles.modalHeader}>
              <Text
                style={{
                  fontFamily: typography.fontSansSemi,
                  fontSize: 18,
                  color: colors.text,
                }}
              >
                Edit payment
              </Text>
              <Pressable onPress={closeEdit} hitSlop={12}>
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  Close
                </Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                gap: spacing.lg,
                paddingBottom: spacing.md,
              }}
            >
              <Field label="Merchant">
                <Input
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  placeholder="Who was this?"
                  autoCapitalize="words"
                  returnKeyType="next"
                  style={inputStyle(colors.bgMuted)}
                />
              </Field>
              <Field label="Amount (₹)">
                <Input
                  value={editAmount}
                  onChangeText={(v) => setEditAmount(sanitizeAmountInput(v))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={inputStyle(colors.bgMuted)}
                />
              </Field>
              <DateField value={editPaidAt} onChange={setEditPaidAt} />
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
              <Field label="Notes (optional)">
                <Input
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Anything to remember"
                  multiline
                  style={[
                    inputStyle(colors.bgMuted),
                    { minHeight: 72, textAlignVertical: "top", paddingTop: 14 },
                  ]}
                />
              </Field>
            </ScrollView>

            <View style={{ marginTop: spacing.lg }}>
              <Button title="Save" onPress={saveEdit} />
            </View>
          </View>
        </KeyboardAvoidingView>
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
    alignItems: "stretch",
  },
  checkHit: {
    justifyContent: "center",
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
    paddingVertical: spacing.md + 2,
    paddingRight: spacing.lg,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
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
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalSheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    maxHeight: "90%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
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
