import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { Button, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

function normalizeAmount(raw: string): string | null {
  const cleaned = raw.replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned) return null;
  // Allow "50." while typing → treat as incomplete until blurred/saved
  if (cleaned === "." || cleaned.endsWith(".")) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function sanitizeAmountInput(raw: string): string {
  // Keep digits + one decimal point, max 2 decimal places
  let next = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) +
      next.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac = ""] = next.split(".");
    next = `${whole}.${frac.slice(0, 2)}`;
  }
  // Strip leading zeros unless "0." decimal
  if (next.length > 1 && next.startsWith("0") && next[1] !== ".") {
    next = next.replace(/^0+/, "") || "0";
  }
  return next;
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = useMemo(() => normalizeAmount(amount), [amount]);
  const canSave =
    merchant.trim().length > 0 && parsedAmount != null && !loading;

  const save = async () => {
    const name = merchant.trim();
    const amt = normalizeAmount(amount);

    if (!name) {
      setError("Enter a merchant name");
      return;
    }
    if (!amt) {
      setError("Enter a valid amount greater than zero");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await api.createExpense({
        merchant: name,
        amount: amt,
        direction,
        paidAt: new Date().toISOString(),
        source: "manual",
        notes: notes.trim() || null,
      });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          e.message.includes("already")
            ? e.message
            : "This payment looks already saved today."
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Could not save expense");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Manual entry" subtitle="Without a UPI screenshot" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.xl,
          }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.field}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}
            >
              Merchant
            </Text>
            <Input
              value={merchant}
              onChangeText={(v) => {
                setMerchant(v);
                if (error) setError(null);
              }}
              placeholder="Who did you pay?"
              autoFocus
              returnKeyType="next"
              style={inputStyle(colors.bgMuted)}
            />
          </View>

          <View style={styles.field}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}
            >
              Amount (₹)
            </Text>
            <Input
              value={amount}
              onChangeText={(v) => {
                setAmount(sanitizeAmountInput(v));
                if (error) setError(null);
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={[
                inputStyle(colors.bgMuted),
                {
                  fontFamily: typography.fontSansSemi,
                  fontSize: 22,
                  letterSpacing: 0.2,
                },
              ]}
            />
          </View>

          <View style={styles.dirRow}>
            <DirChip
              label="Paid"
              active={direction === "debit"}
              onPress={() => setDirection("debit")}
            />
            <DirChip
              label="Received"
              active={direction === "credit"}
              onPress={() => setDirection("credit")}
            />
          </View>

          <View style={styles.field}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}
            >
              Notes
            </Text>
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              style={inputStyle(colors.bgMuted)}
            />
          </View>

          {error ? (
            <Text color={colors.danger} style={{ lineHeight: 20 }}>
              {error}
            </Text>
          ) : null}

          <Button
            title={loading ? "Saving…" : "Save expense"}
            loading={loading}
            style={{ opacity: canSave ? 1 : 0.55 }}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.bgMuted,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontSansSemi,
          fontSize: 15,
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
    minHeight: 56,
  };
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
  },
  dirRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  chip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
