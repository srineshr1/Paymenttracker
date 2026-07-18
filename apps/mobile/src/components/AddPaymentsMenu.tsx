import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
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
import { IconChip } from "@/src/components/SourceLogo";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
  onScreenshot: () => void;
};

const SPRING = { damping: 18, stiffness: 220, mass: 0.85 } as const;

export function AddPaymentsMenu({
  open,
  onOpenChange,
  onManual,
  onScreenshot,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const progress = useSharedValue(0);

  const syncProgress = useCallback(
    (nextOpen: boolean, animated: boolean) => {
      if (animated) {
        progress.value = withSpring(nextOpen ? 1 : 0, SPRING);
      } else {
        progress.value = nextOpen ? 1 : 0;
      }
    },
    [progress]
  );

  // Drive animation from open prop
  useEffect(() => {
    syncProgress(open, true);
  }, [open, syncProgress]);

  // After stack freeze/unfreeze (navigate away & back), re-sync so shared
  // values can't stay stuck open while `open` is already false.
  useFocusEffect(
    useCallback(() => {
      syncProgress(open, false);
      return () => {
        // Snap closed when leaving this screen so return state is clean
        progress.value = 0;
      };
    }, [open, progress, syncProgress])
  );

  // Hardware back closes the menu instead of eating the page / leaving the app
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
      () => undefined
    );
    onOpenChange(!open);
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const manualStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [24, 0],
          Extrapolation.CLAMP
        ),
      },
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.92, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const shotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [40, 0],
          Extrapolation.CLAMP
        ),
      },
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.92, 1],
          Extrapolation.CLAMP
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
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.4, 1],
      [1, 0.3, 0],
      Extrapolation.CLAMP
    ),
    width: interpolate(
      progress.value,
      [0, 1],
      [118, 0],
      Extrapolation.CLAMP
    ),
  }));

  const bottom = Math.max(insets.bottom, 16) + 12;

  const runAction = (action: () => void) => {
    // Close first, snap progress, then navigate on next frame so the home
    // screen never freezes mid-open (which made UI vanish on back).
    onOpenChange(false);
    progress.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
    requestAnimationFrame(() => {
      action();
    });
  };

  return (
    <>
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
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

      <View pointerEvents="box-none" style={[styles.dock, { bottom }]}>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[styles.optionWrap, shotStyle]}
        >
          <Pressable
            onPress={() => runAction(onScreenshot)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderStrong,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <IconChip
              name="image-outline"
              color={colors.accentStrong}
              bg={colors.accentSoft}
              size={40}
              iconSize={20}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Screenshot</Text>
              <Text muted style={{ fontSize: 12 }}>
                PhonePe / GPay
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[styles.optionWrap, manualStyle]}
        >
          <Pressable
            onPress={() => runAction(onManual)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderStrong,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <IconChip
              name="create-outline"
              color={colors.text}
              bg={colors.bgMuted}
              size={40}
              iconSize={20}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Manual</Text>
              <Text muted style={{ fontSize: 12 }}>
                Type amount & merchant
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        <Pressable
          onPress={toggle}
          style={({ pressed }) => [
            styles.mainBtn,
            {
              backgroundColor: colors.accent,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Animated.View style={[styles.mainIconBox, mainIconStyle]}>
            <Ionicons name="add" size={28} color={colors.accentOn} />
          </Animated.View>
          <Animated.View style={[styles.mainLabel, labelStyle]}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: typography.fontSansSemi,
                fontSize: 15,
                color: colors.accentOn,
              }}
            >
              {open ? "" : "Add payments"}
            </Text>
          </Animated.View>
        </Pressable>
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
    right: spacing.xl,
    zIndex: 50,
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  optionWrap: {
    width: 228,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    flex: 1,
    justifyContent: "center",
  },
  optionTitle: {
    fontFamily: typography.fontSansSemi,
    fontSize: 15,
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    gap: 4,
    overflow: "hidden",
  },
  mainIconBox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  mainLabel: {
    overflow: "hidden",
    justifyContent: "center",
  },
});
