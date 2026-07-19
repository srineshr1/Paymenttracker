import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addToWallet,
  deductFromWallet,
  movementsFor,
  totalLiquid,
  type WalletId,
  type WalletMovement,
  type WalletsState,
} from "@/src/data/cash";
import { formatINR, formatRelativePaidAt } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { Button, Input, Text } from "@/src/components/ui";

const OPEN_MS = 280;
const CLOSED_Y = Dimensions.get("window").height;
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 700;

function dismissWithVelocity(
  currentY: number,
  velocityY: number
): { toValue: number; duration: number } {
  "worklet";
  const remaining = Math.max(CLOSED_Y - currentY, 1);
  const speed = Math.max(Math.abs(velocityY), 900);
  const duration = Math.min(420, Math.max(160, (remaining / speed) * 1000));
  return { toValue: CLOSED_Y, duration };
}

function snapSpring(velocity: number): WithSpringConfig {
  "worklet";
  return {
    velocity,
    damping: 22,
    stiffness: 260,
    mass: 0.7,
    overshootClamping: true,
  };
}

function sanitizeAmountInput(raw: string): string {
  let next = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) +
      next.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac = ""] = next.split(".");
    next = `${whole}.${frac.slice(0, 2)}`;
  }
  if (next.length > 1 && next.startsWith("0") && next[1] !== ".") {
    next = next.replace(/^0+/, "") || "0";
  }
  return next;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned.endsWith(".")) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type Props = {
  open: boolean;
  onClose: () => void;
  initialWallet: WalletId;
  initialMode?: "add" | "deduct";
  wallets: WalletsState;
  onChanged: (next: WalletsState) => void;
};

export function CashSheet({
  open,
  onClose,
  initialWallet,
  initialMode = "add",
  wallets,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [wallet, setWallet] = useState<WalletId>(initialWallet);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [logExpense, setLogExpense] = useState(true);
  const [mode, setMode] = useState<"add" | "deduct">(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(open);
  const translateY = useSharedValue(open ? 0 : CLOSED_Y);
  const dragStartY = useSharedValue(0);
  const gestureDismissing = useSharedValue(false);

  useEffect(() => {
    if (!open) return;
    setWallet(initialWallet);
    setAmount("");
    setNote("");
    setLogExpense(true);
    setMode(initialMode);
    setError(null);
  }, [open, initialWallet, initialMode]);

  const finishUnmount = useCallback(() => {
    setMounted(false);
  }, []);

  const finishGestureDismiss = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      gestureDismissing.value = false;
      setMounted(true);
      cancelAnimation(translateY);
      translateY.value = withTiming(0, {
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    if (!mounted) return;
    if (gestureDismissing.value) return;
    cancelAnimation(translateY);
    translateY.value = withTiming(
      CLOSED_Y,
      { duration: 280, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishUnmount)();
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onStart(() => {
      cancelAnimation(translateY);
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, dragStartY.value + e.translationY);
    })
    .onEnd((e) => {
      const shouldDismiss =
        translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        gestureDismissing.value = true;
        const { toValue, duration } = dismissWithVelocity(
          translateY.value,
          e.velocityY
        );
        translateY.value = withTiming(
          toValue,
          { duration, easing: Easing.linear },
          (finished) => {
            if (finished) runOnJS(finishGestureDismiss)();
          }
        );
        return;
      }
      translateY.value = withSpring(0, snapSpring(e.velocityY));
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, CLOSED_Y],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const balance =
    wallet === "account" ? wallets.accountBalance : wallets.cashBalance;
  const recent = useMemo(
    () => movementsFor(wallets, wallet, 12),
    [wallets, wallet]
  );
  const liquid = totalLiquid(wallets);
  const parsed = parseAmount(amount);
  const canSubmit = parsed != null && !busy;

  const submit = async () => {
    const n = parseAmount(amount);
    if (n == null) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        mode === "add"
          ? await addToWallet(wallet, n, note)
          : await deductFromWallet(wallet, n, {
              note,
              logExpense: wallet === "cash" ? logExpense : false,
              merchant: note.trim() || undefined,
            });
      onChanged(next);
      setAmount("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update balance.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.border,
                paddingBottom: insets.bottom + spacing.lg,
              },
              sheetStyle,
            ]}
          >
            <View style={styles.handleRow}>
              <View
                style={[styles.handle, { backgroundColor: colors.borderStrong }]}
              />
            </View>

            <Text
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 18,
                color: colors.text,
                marginBottom: spacing.md,
              }}
            >
              Money
            </Text>

            <View
              style={[styles.walletTabs, { backgroundColor: colors.bgMuted }]}
            >
              {(
                [
                  { id: "account" as const, label: "In account" },
                  { id: "cash" as const, label: "Cash in hand" },
                ] as const
              ).map((tab) => {
                const active = wallet === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      setWallet(tab.id);
                      setError(null);
                    }}
                    style={[
                      styles.walletTab,
                      active && {
                        backgroundColor: colors.bgCard,
                        borderColor: colors.border,
                        borderWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: active
                          ? typography.fontSansSemi
                          : typography.fontSansMedium,
                        fontSize: 13,
                        color: active ? colors.text : colors.textSecondary,
                        textAlign: "center",
                      }}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
            >
              <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
                <Text
                  style={{
                    fontFamily: typography.fontSans,
                    fontSize: 13,
                    color: colors.textSecondary,
                  }}
                >
                  {wallet === "account" ? "In account" : "Cash in hand"}
                </Text>
                <Text
                  style={{
                    fontFamily: typography.fontSansBold,
                    fontSize: 36,
                    letterSpacing: -0.6,
                    color: colors.text,
                    marginTop: 4,
                  }}
                >
                  {formatINR(balance)}
                </Text>
                <Text
                  style={{
                    fontFamily: typography.fontSans,
                    fontSize: 12,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Total liquid {formatINR(liquid)}
                </Text>
              </View>

              <View
                style={[styles.modeRow, { backgroundColor: colors.bgMuted }]}
              >
                {(
                  [
                    { id: "add" as const, label: "Add" },
                    { id: "deduct" as const, label: "Deduct" },
                  ] as const
                ).map((m) => {
                  const active = mode === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        setMode(m.id);
                        setError(null);
                      }}
                      style={[
                        styles.modeBtn,
                        active && {
                          backgroundColor:
                            m.id === "deduct"
                              ? colors.dangerSoft
                              : colors.bgCard,
                          borderColor:
                            m.id === "deduct" ? colors.danger : colors.border,
                          borderWidth: StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontFamily: typography.fontSansSemi,
                          fontSize: 14,
                          color:
                            active && m.id === "deduct"
                              ? colors.danger
                              : colors.text,
                          textAlign: "center",
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View>
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginBottom: 6,
                  }}
                >
                  Amount
                </Text>
                <Input
                  value={amount}
                  onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View>
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginBottom: 6,
                  }}
                >
                  Note (optional)
                </Text>
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    mode === "add" ? "ATM, change, gift…" : "What for?"
                  }
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {wallet === "cash" && mode === "deduct" ? (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Text
                      style={{
                        fontFamily: typography.fontSansMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Log as expense
                    </Text>
                    <Text
                      style={{
                        fontFamily: typography.fontSans,
                        fontSize: 12,
                        color: colors.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      Counts toward monthly spend
                    </Text>
                  </View>
                  <Switch
                    value={logExpense}
                    onValueChange={setLogExpense}
                    trackColor={{
                      false: colors.borderStrong,
                      true: colors.accent,
                    }}
                    thumbColor={colors.bgCard}
                  />
                </View>
              ) : null}

              {error ? (
                <Text style={{ color: colors.danger, fontSize: 13 }}>
                  {error}
                </Text>
              ) : null}

              <Button
                title={
                  busy
                    ? "Saving…"
                    : mode === "add"
                      ? "Add money"
                      : "Deduct money"
                }
                loading={busy}
                disabled={!canSubmit}
                onPress={() => void submit()}
                variant={mode === "deduct" ? "danger" : "primary"}
              />

              {recent.length > 0 ? (
                <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                  <Text
                    style={{
                      fontFamily: typography.fontSansMedium,
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginBottom: 4,
                    }}
                  >
                    Recent
                  </Text>
                  {recent.map((m) => (
                    <MovementRow key={m.id} move={m} />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function MovementRow({ move }: { move: WalletMovement }) {
  const { colors } = useTheme();
  const add = move.type === "add";
  return (
    <View style={styles.moveRow}>
      <View
        style={[
          styles.moveIcon,
          {
            backgroundColor: add ? "rgba(143,203,176,0.14)" : colors.dangerSoft,
          },
        ]}
      >
        <Ionicons
          name={add ? "arrow-down" : "arrow-up"}
          size={14}
          color={add ? colors.credit : colors.danger}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: typography.fontSansMedium,
            fontSize: 14,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {move.note || (add ? "Added" : "Deducted")}
          {move.expenseId ? " · expense" : ""}
        </Text>
        <Text
          style={{
            fontFamily: typography.fontSans,
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 1,
          }}
        >
          {formatRelativePaidAt(move.createdAt)}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: typography.fontSansSemi,
          fontSize: 14,
          color: add ? colors.credit : colors.danger,
        }}
      >
        {add ? "+" : "−"}
        {formatINR(move.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "82%",
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
  walletTabs: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
    marginBottom: spacing.sm,
  },
  walletTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.xs,
  },
  modeRow: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 8,
  },
  moveIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
