import { useRouter } from "expo-router";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
      next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
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
  const scrollY = useRef(0);
  const keyboardH = useRef(0);
  const notesWrapRef = useRef<View>(null);
  const amountWrapRef = useRef<View>(null);
  const merchantWrapRef = useRef<View>(null);

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
      const h = e.endCoordinates.height;
      keyboardH.current = h;
      // Full keyboard height so bottom fields can scroll fully clear
      setKeyboardPad(h);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      keyboardH.current = 0;
      setKeyboardPad(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  /**
   * Measure the focused field on screen and scroll until it sits above the keyboard.
   * Runs twice: once soon after focus, once after the keyboard finishes opening.
   */
  const ensureVisible = (wrapRef: RefObject<View | null>) => {
    const run = () => {
      const node = wrapRef.current;
      if (!node) return;
      node.measureInWindow((_x, y, _w, h) => {
        const winH = Dimensions.get("window").height;
        const kb = keyboardH.current;
        // If keyboard height not known yet, assume ~45% of screen (Gboard-ish)
        const kbGuess = kb > 0 ? kb : Math.round(winH * 0.42);
        const visibleBottom = winH - kbGuess - 16;
        const fieldBottom = y + h;
        if (fieldBottom <= visibleBottom) return;
        const delta = fieldBottom - visibleBottom + 8;
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollY.current + delta),
          animated: true,
        });
      });
    };
    // Immediate + delayed passes (keyboard animation / adjustResize lag)
    requestAnimationFrame(run);
    setTimeout(run, 80);
    setTimeout(run, 220);
    setTimeout(run, 400);
  };

  const save = async () => {
    const name = merchant.trim();
    const amt = normalizeAmount(amount);

    if (!name) {
      setError(
        direction === "credit"
          ? "Enter who you received from"
          : "Enter a merchant name",
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
            : "This payment looks already saved today.",
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom:
              insets.bottom + spacing.xxl + Math.max(keyboardPad, 0) + 24,
            gap: spacing.xl,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <View ref={merchantWrapRef} style={styles.field} collapsable={false}>
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
              onFocus={() => ensureVisible(merchantWrapRef)}
            />
          </View>

          <View ref={amountWrapRef} style={styles.field} collapsable={false}>
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
              onFocus={() => ensureVisible(amountWrapRef)}
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

          {/* Notes sits mid-form so the keyboard is less likely to bury it */}
          <View ref={notesWrapRef} style={styles.field} collapsable={false}>
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
              onFocus={() => ensureVisible(notesWrapRef)}
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
