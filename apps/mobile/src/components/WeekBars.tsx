import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Text } from "@/src/components/ui";
import { formatINRCompact } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type WeekDayBar = {
  /** 0 = Mon … 6 = Sun */
  dayIndex: number;
  amount: number;
  /** future day with no data yet */
  empty?: boolean;
  /** highlight (e.g. today) */
  active?: boolean;
};

type Props = {
  days: WeekDayBar[];
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
};

type DayColProps = {
  day: WeekDayBar;
  max: number;
  chartH: number;
  selected: boolean;
  onSelect: (dayIndex: number) => void;
  isDark: boolean;
  accent: string;
  accentStrong: string;
  textMuted: string;
  trackBg: string;
};

function DayCol({
  day,
  max,
  chartH,
  selected,
  onSelect,
  isDark,
  accent,
  accentStrong,
  textMuted,
  trackBg,
}: DayColProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  const hasSpend = !day.empty && day.amount > 0;
  const isPeak = hasSpend && day.amount === max;
  const ratio = hasSpend ? day.amount / max : 0;
  const barH = hasSpend
    ? Math.max(10, ratio * (chartH - 36))
    : day.empty
      ? 0
      : 4;

  // Soft wash → richer accent by spend intensity
  const fillTop = day.active || isPeak || selected
    ? accent
    : isDark
      ? `rgba(201,164,108,${0.35 + ratio * 0.45})`
      : `rgba(154,107,47,${0.28 + ratio * 0.5})`;
  const fillBottom = day.active || isPeak || selected
    ? isDark
      ? "rgba(201,164,108,0.55)"
      : "rgba(154,107,47,0.55)"
    : isDark
      ? `rgba(201,164,108,${0.18 + ratio * 0.25})`
      : `rgba(154,107,47,${0.14 + ratio * 0.28})`;

  const onPressIn = () => {
    scale.value = withSpring(0.96, { damping: 16, stiffness: 320 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 280 });
  };
  const onPress = () => {
    if (day.empty) return;
    void Haptics.selectionAsync();
    onSelect(day.dayIndex);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={day.empty}
      accessibilityRole="button"
      accessibilityLabel={`${DAY_LABELS[day.dayIndex]}${
        hasSpend ? `, ${formatINRCompact(day.amount)}` : day.empty ? ", upcoming" : ", no spend"
      }`}
      accessibilityState={{ selected }}
      style={styles.col}
    >
      <View style={[styles.amountSlot, { height: 22 }]}>
        {selected && !day.empty ? (
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={[
              styles.amountPill,
              {
                backgroundColor: isDark
                  ? "rgba(201,164,108,0.18)"
                  : "rgba(154,107,47,0.12)",
                borderColor: isDark
                  ? "rgba(201,164,108,0.28)"
                  : "rgba(154,107,47,0.2)",
              },
            ]}
          >
            <Text
              style={{
                fontFamily: typography.fontMonoMed,
                fontSize: 10,
                color: accentStrong,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {hasSpend ? formatINRCompact(day.amount) : "₹0"}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.barTrack, { height: chartH - 22 }]}>
        {/* Soft rail behind every bar */}
        <View
          style={[
            styles.rail,
            {
              backgroundColor: trackBg,
              height: "100%",
              opacity: day.empty ? 0.35 : 1,
            },
          ]}
        />

        {day.empty ? (
          <View style={styles.emptyDotWrap}>
            <View
              style={[
                styles.emptyDot,
                {
                  borderColor: isDark
                    ? "rgba(201,164,108,0.28)"
                    : "rgba(154,107,47,0.22)",
                  backgroundColor: isDark
                    ? "rgba(201,164,108,0.06)"
                    : "rgba(154,107,47,0.05)",
                },
              ]}
            />
          </View>
        ) : (
          <Animated.View
            style={[
              styles.barShell,
              {
                height: barH,
                // Selected ring
                shadowColor: accent,
                shadowOpacity: selected ? 0.35 : 0,
                shadowRadius: selected ? 6 : 0,
                shadowOffset: { width: 0, height: 2 },
                elevation: selected ? 3 : 0,
              },
              animStyle,
            ]}
          >
            <LinearGradient
              colors={[fillTop, fillBottom]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[
                styles.barFill,
                selected && {
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: isDark
                    ? "rgba(224,192,138,0.55)"
                    : "rgba(122,82,32,0.35)",
                },
              ]}
            />
          </Animated.View>
        )}
      </View>

      <Text
        style={{
          marginTop: spacing.sm,
          textAlign: "center",
          fontFamily:
            day.active || selected
              ? typography.fontSansSemi
              : typography.fontSans,
          fontSize: 11,
          color:
            day.active || selected
              ? accentStrong
              : day.empty
                ? textMuted
                : textMuted,
          opacity: day.empty ? 0.55 : 1,
        }}
      >
        {DAY_LABELS[day.dayIndex]}
      </Text>
    </Pressable>
  );
}

/**
 * Vertical bar chart for daily spend.
 * Tap a day to reveal its amount; swipe to change week.
 */
export function WeekBars({
  days,
  onPrevWeek,
  onNextWeek,
  canGoPrev = true,
  canGoNext = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const max = Math.max(1, ...days.map((d) => (d.empty ? 0 : d.amount)));
  const chartH = 128;
  const [selected, setSelected] = useState<number | null>(null);

  // Clear selection when the week data set changes
  useEffect(() => {
    setSelected(null);
  }, [days]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrevWeek?.();
  }, [canGoPrev, onPrevWeek]);

  const goNext = useCallback(() => {
    if (canGoNext) onNextWeek?.();
  }, [canGoNext, onNextWeek]);

  const onSelect = useCallback((dayIndex: number) => {
    setSelected((prev) => (prev === dayIndex ? null : dayIndex));
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-28, 28])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      "worklet";
      if (e.translationX > 52) runOnJS(goPrev)();
      else if (e.translationX < -52) runOnJS(goNext)();
    });

  const trackBg = isDark ? "rgba(201,164,108,0.07)" : "rgba(154,107,47,0.06)";

  return (
    <View style={styles.wrap}>
      <View style={styles.navRow}>
        <Pressable
          onPress={goPrev}
          disabled={!canGoPrev}
          hitSlop={10}
          style={({ pressed }) => [
            styles.navBtn,
            {
              backgroundColor: colors.bgMuted,
              opacity: !canGoPrev ? 0.35 : pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Previous week"
        >
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text muted style={styles.hint}>
          Tap a day · swipe weeks
        </Text>
        <Pressable
          onPress={goNext}
          disabled={!canGoNext}
          hitSlop={10}
          style={({ pressed }) => [
            styles.navBtn,
            {
              backgroundColor: colors.bgMuted,
              opacity: !canGoNext ? 0.35 : pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Next week"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.text} />
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.chartRow}>
          {days.map((d) => (
            <DayCol
              key={d.dayIndex}
              day={d}
              max={max}
              chartH={chartH}
              selected={selected === d.dayIndex}
              onSelect={onSelect}
              isDark={isDark}
              accent={colors.accent}
              accentStrong={colors.accentStrong}
              textMuted={colors.textMuted}
              trackBg={trackBg}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 11,
    fontFamily: typography.fontSans,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    minHeight: 150,
  },
  col: {
    flex: 1,
    alignItems: "center",
  },
  amountSlot: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  amountPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  barTrack: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  rail: {
    position: "absolute",
    bottom: 0,
    width: 10,
    borderRadius: radius.pill,
  },
  barShell: {
    width: 10,
    borderRadius: radius.pill,
    overflow: "hidden",
    // scale from bottom
    transformOrigin: "bottom",
  },
  barFill: {
    flex: 1,
    width: "100%",
    borderRadius: radius.pill,
  },
  emptyDotWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  emptyDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
});
