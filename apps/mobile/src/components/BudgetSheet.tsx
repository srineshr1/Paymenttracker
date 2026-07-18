import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type BudgetMode,
  type BudgetPrefs,
  DEFAULT_SAVINGS_RATE,
  setBudgetPrefs,
} from "@/src/data/budget";
import { formatINR } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { Button, Input, Text } from "@/src/components/ui";

const SAVINGS_CHIPS = [0.1, 0.2, 0.25, 0.3, 0.4] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: BudgetPrefs;
  /** Live auto budget for preview */
  autoBudgetPreview: number;
  onSaved: (prefs: BudgetPrefs) => void;
};

export function BudgetSheet({
  open,
  onClose,
  prefs,
  autoBudgetPreview,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [mode, setMode] = useState<BudgetMode>(prefs.mode);
  const [savingsRate, setSavingsRate] = useState(prefs.savingsRate);
  const [manualText, setManualText] = useState(String(prefs.manualBudget));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(prefs.mode);
    setSavingsRate(prefs.savingsRate);
    setManualText(String(prefs.manualBudget));
    setError(null);
  }, [open, prefs]);

  const onSave = async () => {
    setError(null);
    let manualBudget = prefs.manualBudget;
    if (mode === "manual") {
      const n = Number(String(manualText).replace(/[, ]/g, ""));
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a valid budget amount.");
        return;
      }
      manualBudget = Math.round(n);
    }

    setSaving(true);
    try {
      const next = await setBudgetPrefs({
        mode,
        savingsRate,
        manualBudget:
          mode === "manual"
            ? manualBudget
            : Math.max(
                prefs.manualBudget,
                Math.round(autoBudgetPreview) || prefs.manualBudget
              ),
      });
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.border,
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={styles.handleRow}>
            <View
              style={[styles.handle, { backgroundColor: colors.borderStrong }]}
            />
          </View>

          <View style={styles.titleRow}>
            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 18,
                color: colors.text,
              }}
            >
              Budget & savings
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.md }}
          >
            <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
              Smart budget uses income this month (or recent average), then sets
              spendable money after your savings rate.
            </Text>

            <View style={{ gap: spacing.sm }}>
              <Text variant="label">Mode</Text>
              <View style={styles.modeRow}>
                {(
                  [
                    {
                      key: "auto" as const,
                      label: "Smart",
                      hint: "From income",
                    },
                    {
                      key: "manual" as const,
                      label: "Custom",
                      hint: "Fixed amount",
                    },
                  ] as const
                ).map((opt) => {
                  const active = mode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setMode(opt.key)}
                      style={[
                        styles.modeChip,
                        {
                          backgroundColor: active
                            ? colors.accentSoft
                            : colors.bgMuted,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontFamily: typography.fontSansSemi,
                          fontSize: 14,
                          color: active ? colors.accentStrong : colors.text,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text muted style={{ fontSize: 11, marginTop: 2 }}>
                        {opt.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {mode === "auto" ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Save each month</Text>
                <View style={styles.chipRow}>
                  {SAVINGS_CHIPS.map((rate) => {
                    const active = Math.abs(savingsRate - rate) < 0.001;
                    return (
                      <Pressable
                        key={rate}
                        onPress={() => setSavingsRate(rate)}
                        style={[
                          styles.pctChip,
                          {
                            backgroundColor: active
                              ? colors.accent
                              : isDark
                                ? colors.bgMuted
                                : colors.bg,
                            borderColor: active
                              ? colors.accent
                              : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontFamily: typography.fontSansSemi,
                            fontSize: 13,
                            color: active ? colors.accentOn : colors.text,
                          }}
                        >
                          {Math.round(rate * 100)}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
                  Spendable ≈ {formatINR(autoBudgetPreview)} (income ×{" "}
                  {Math.round((1 - savingsRate) * 100)}%)
                  {savingsRate === DEFAULT_SAVINGS_RATE ? " · default" : ""}
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Monthly budget (₹)</Text>
                <Input
                  value={manualText}
                  onChangeText={setManualText}
                  keyboardType="number-pad"
                  placeholder="e.g. 40000"
                />
              </View>
            )}

            {error ? (
              <Text color={colors.danger} style={{ fontSize: 13 }}>
                {error}
              </Text>
            ) : null}

            <Button
              title={saving ? "Saving…" : "Save"}
              loading={saving}
              onPress={onSave}
              disabled={saving}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: "78%",
  },
  handleRow: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  modeChip: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pctChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
