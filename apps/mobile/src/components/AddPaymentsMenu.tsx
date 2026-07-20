import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  BackHandler,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
  onScreenshot: () => void;
};

const MORPH_SPRING = { damping: 20, stiffness: 170, mass: 0.9 } as const;
const PRESS_SPRING = { damping: 16, stiffness: 420, mass: 0.55 } as const;

const BTN_SIZE = 56;
const ICON_SIZE = 28;
const PAD_CLOSED = 22;
const GAP_CLOSED = 8;
const LABEL_FALLBACK = 102;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AddPaymentsMenu({
  open,
  onOpenChange,
  onManual,
  onScreenshot,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const progress = useSharedValue(0);
  const press = useSharedValue(0);
  const labelW = useSharedValue(0);

  const onLabelLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = Math.ceil(e.nativeEvent.layout.width);
      if (w > 0 && Math.abs(w - labelW.value) > 0.5) {
        labelW.value = w;
      }
    },
    [labelW],
  );

  const syncProgress = useCallback(
    (nextOpen: boolean, animated: boolean) => {
      if (animated) {
        progress.value = withSpring(nextOpen ? 1 : 0, MORPH_SPRING);
      } else {
        progress.value = nextOpen ? 1 : 0;
      }
    },
    [progress],
  );

  useEffect(() => {
    syncProgress(open, true);
  }, [open, syncProgress]);

  useFocusEffect(
    useCallback(() => {
      const ready = requestAnimationFrame(() => {
        progress.value = 0;
        press.value = 0;
      });
      return () => {
        cancelAnimationFrame(ready);
      };
    }, [progress, press]),
  );

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onOpenChange(false);
      return true;
    });
    return () => sub.remove();
  }, [open, onOpenChange]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
    onOpenChange(!open);
  };

  const onPressIn = () => {
    press.value = withSpring(1, PRESS_SPRING);
  };

  const onPressOut = () => {
    press.value = withSpring(0, PRESS_SPRING);
  };

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      zIndex: opacity > 0.02 ? 40 : -1,
    };
  });

  const shotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [16, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.96, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const mainIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(
          progress.value,
          [0, 1],
          [0, 45],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => {
    const lw = labelW.value > 0 ? labelW.value : LABEL_FALLBACK;
    return {
      width: interpolate(progress.value, [0, 1], [lw, 0], Extrapolation.CLAMP),
      marginLeft: interpolate(
        progress.value,
        [0, 1],
        [GAP_CLOSED, 0],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(
        progress.value,
        [0, 0.4, 0.75],
        [1, 0.35, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  const mainBtnStyle = useAnimatedStyle(() => {
    const lw = labelW.value > 0 ? labelW.value : LABEL_FALLBACK;
    const closedW = PAD_CLOSED * 2 + ICON_SIZE + GAP_CLOSED + lw;
    const pressScale = interpolate(press.value, [0, 1], [1, 0.94]);

    return {
      width: interpolate(
        progress.value,
        [0, 1],
        [closedW, BTN_SIZE],
        Extrapolation.CLAMP,
      ),
      paddingHorizontal: interpolate(
        progress.value,
        [0, 1],
        [PAD_CLOSED, 0],
        Extrapolation.CLAMP,
      ),
      transform: [{ scale: pressScale }],
    };
  });

  const bottom = Math.max(insets.bottom, 16) + 12;

  const runAction = (action: () => void) => {
    onOpenChange(false);
    progress.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    requestAnimationFrame(() => {
      action();
    });
  };

  return (
    <>
      {open ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.backdrop,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.45)"
                : "rgba(20,22,28,0.28)",
            },
            backdropStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => onOpenChange(false)}
          />
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.dock, { bottom }]}>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.border,
            },
            shotStyle,
          ]}
        >
          <Pressable
            onPress={() => runAction(onScreenshot)}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.bgMuted },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Import screenshot
              </Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                PhonePe or GPay
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => runAction(onManual)}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.bgMuted },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Enter manually
              </Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Amount and merchant
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
        </Animated.View>

        <AnimatedPressable
          onPress={toggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={open ? "Close add menu" : "Add payments"}
          style={[
            styles.mainBtn,
            { backgroundColor: colors.accent },
            mainBtnStyle,
          ]}
        >
          <Animated.View style={[styles.mainIconBox, mainIconStyle]}>
            <Ionicons
              name="add"
              size={ICON_SIZE}
              color={colors.accentOn}
              style={styles.mainIcon}
            />
          </Animated.View>

          <Text
            numberOfLines={1}
            onLayout={onLabelLayout}
            style={styles.labelMeasure}
            pointerEvents="none"
          >
            Add payments
          </Text>

          <Animated.View
            pointerEvents="none"
            style={[styles.mainLabel, labelStyle]}
          >
            <Text
              numberOfLines={1}
              style={[styles.labelText, { color: colors.accentOn }]}
            >
              Add payments
            </Text>
          </Animated.View>
        </AnimatedPressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 50,
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    width: "100%",
    maxWidth: 320,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  rowHint: {
    fontFamily: typography.fontSans,
    fontSize: 12,
    letterSpacing: 0.1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: BTN_SIZE,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  mainIconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  mainIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  mainLabel: {
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  labelText: {
    fontFamily: typography.fontSansSemi,
    fontSize: 15,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  labelMeasure: {
    position: "absolute",
    opacity: 0,
    fontFamily: typography.fontSansSemi,
    fontSize: 15,
    includeFontPadding: false,
  },
});
