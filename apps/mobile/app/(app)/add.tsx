import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { CategoryChips } from "@/src/components/CategoryChips";
import { DateField } from "@/src/components/DateField";
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
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [paidAt, setPaidAt] = useState(() => new Date());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  const parsedAmount = useMemo(() => normalizeAmount(amount), [amount]);
  const canSave =
    merchant.trim().length > 0 && parsedAmount != null && !loading;

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      // iOS: full keyboard height (KAV + padding).
      // Android: window already adjustResize — just leave room to scroll Notes up.
      setKeyboardPad(
        Platform.OS === "android"
          ? Math.max(160, Math.round(e.endCoordinates.height * 0.35))
          : e.endCoordinates.height
      );
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const rememberFieldY = (key: string) => (e: LayoutChangeEvent) => {
    fieldOffsets.current[key] = e.nativeEvent.layout.y;
  };

  const scrollFieldIntoView = (key: string) => {
    const y = fieldOffsets.current[key];
    if (y == null) {
      // Notes/save sit near the bottom — ensure they're reachable
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }
    // Small delay so keyboard height is applied to content padding first
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - spacing.lg),
        animated: true,
      });
    }, Platform.OS === "ios" ? 50 : 120);
  };

  const save = async () => {
    const name = merchant.trim();
    const amt = normalizeAmount(amount);

    if (!name) {
      setError(
        direction === "credit"
          ? "Enter who you received from"
          : "Enter a merchant name"
      );
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
        paidAt: paidAt.toISOString(),
        source: "manual",
        notes: notes.trim() || null,
        categoryId,
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
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            padding: spacing.xl,
            // Keyboard pad lets Notes / Save scroll fully above the keyboard
            paddingBottom:
              insets.bottom + spacing.xxl + Math.max(keyboardPad, 0),
            gap: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.field} onLayout={rememberFieldY("merchant")}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}
            >
              {direction === "credit" ? "From" : "Merchant"}
            </Text>
            <Input
              value={merchant}
              onChangeText={(v) => {
                setMerchant(v);
                if (error) setError(null);
              }}
              placeholder={
                direction === "credit"
                  ? "Who did you receive from?"
                  : "Who did you pay?"
              }
              autoFocus
              returnKeyType="next"
              style={inputStyle(colors.bgMuted)}
              onFocus={() => scrollFieldIntoView("merchant")}
            />
          </View>

          <View style={styles.field} onLayout={rememberFieldY("amount")}>
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
              onFocus={() => scrollFieldIntoView("amount")}
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

          <DateField value={paidAt} onChange={setPaidAt} />

          <View style={styles.field}>
            <Text
              style={{
                fontFamily: typography.fontSansMedium,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}
            >
              Category
            </Text>
            <CategoryChips value={categoryId} onChange={setCategoryId} />
          </View>

          <View style={styles.field} onLayout={rememberFieldY("notes")}>
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
              onFocus={() => scrollFieldIntoView("notes")}
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
