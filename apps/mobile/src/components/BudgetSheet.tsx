import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type WithSpringConfig,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input, Text } from "@/src/components/ui";
import {
  type BudgetMode,
  type BudgetPrefs,
  DEFAULT_SAVINGS_RATE,
  setBudgetPrefs,
} from "@/src/data/budget";
import { formatINR } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

const SAVINGS_CHIPS = [0.1, 0.2, 0.25, 0.3, 0.4] as const;
const OPEN_MS = 280;
/** Fully off-screen so momentum can coast out of view. */
const CLOSED_Y = Dimensions.get("window").height;
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 700;

/**
 * Dismiss uses velocity-matched timing so swipe speed carries through
 * instead of switching to a fixed slow close.
 */
function dismissWithVelocity(
  currentY: number,
  velocityY: number,
): { toValue: number; duration: number } {
  "worklet";
  const remaining = Math.max(CLOSED_Y - currentY, 1);
  // px/s — keep a floor so a slow drag past the threshold still finishes cleanly
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
  /** Keep Modal mounted through exit animation. */
  const [mounted, setMounted] = useState(open);
  const translateY = useSharedValue(open ? 0 : CLOSED_Y);
  const dragStartY = useSharedValue(0);
  /** Gesture is driving the close animation — skip the open=false effect. */
  const gestureDismissing = useSharedValue(false);

  useEffect(() => {
    if (!open) return;
    setMode(prefs.mode);
    setSavingsRate(prefs.savingsRate);
    setManualText(String(prefs.manualBudget));
    setError(null);
  }, [open, prefs]);

  const finishUnmount = useCallback(() => {
    setMounted(false);
  }, []);

  /** Called after gesture-driven dismiss finishes animating. */
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
    // Swipe already animating out with momentum — don't restart a fixed close.
    if (gestureDismissing.value) return;
    cancelAnimation(translateY);
    translateY.value = withTiming(
      CLOSED_Y,
      {
        duration: 280,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(finishUnmount)();
      },
    );
    // Only react to `open`; shared values managed inside.
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
      // Drag down only — ignore upward pull.
      translateY.value = Math.max(0, dragStartY.value + e.translationY);
    })
    .onEnd((e) => {
      const shouldDismiss =
        translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        // Coast off-screen at the swipe's speed (fast flick = fast close).
        gestureDismissing.value = true;
        const { toValue, duration } = dismissWithVelocity(
          translateY.value,
          e.velocityY,
        );
        translateY.value = withTiming(
          toValue,
          {
            duration,
            // Linear keeps finger speed through the rest of the travel.
            easing: Easing.linear,
          },
          (finished) => {
            if (finished) runOnJS(finishGestureDismiss)();
          },
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
      Extrapolation.CLAMP,
    ),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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
                Math.round(autoBudgetPreview) || prefs.manualBudget,
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
      visible={mounted}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* RNGH needs its own root inside RN Modal on Android. */}
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
                style={[
                  styles.handle,
                  { backgroundColor: colors.borderStrong },
                ]}
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
              bounces={false}
              contentContainerStyle={{
                gap: spacing.lg,
                paddingBottom: spacing.md,
              }}
            >
              <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
                Smart budget uses the stronger of this month’s credits and your
                recent average income, then sets spendable money after your
                savings rate. Sparse SMS credits fall back to past spend or a
                safe default so one small credit can’t collapse the budget.
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
                    Spendable ≈ {formatINR(autoBudgetPreview)} after saving{" "}
                    {Math.round(savingsRate * 100)}%
                    {savingsRate === DEFAULT_SAVINGS_RATE
                      ? " · default rate"
                      : ""}
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
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
