import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
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

/**
 * Simple vertical bar chart for daily spend.
 * No library chart animations — week changes update instantly.
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
  const chartH = 120;
  // Theme-tinted bars: soft wash for low spend → full accent for peak / today
  const barMuted = isDark
    ? "rgba(201,164,108,0.28)"
    : "rgba(154,107,47,0.22)";
  const barMid = isDark
    ? "rgba(201,164,108,0.55)"
    : "rgba(154,107,47,0.48)";

  const goPrev = useCallback(() => {
    if (canGoPrev) onPrevWeek?.();
  }, [canGoPrev, onPrevWeek]);

  const goNext = useCallback(() => {
    if (canGoNext) onNextWeek?.();
  }, [canGoNext, onNextWeek]);

  const pan = Gesture.Pan()
    .activeOffsetX([-28, 28])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      "worklet";
      if (e.translationX > 52) runOnJS(goPrev)();
      else if (e.translationX < -52) runOnJS(goNext)();
    });

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
          Swipe to change week
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
        <View>
          <View style={[styles.chart, { height: chartH }]}>
            {days.map((d) => {
              const h =
                d.empty || d.amount <= 0
                  ? 0
                  : Math.max(8, (d.amount / max) * (chartH - 28));
              // Label peak day + today when it has spend
              const isPeak = !d.empty && d.amount > 0 && d.amount === max;
              const showLabel = d.amount > 0 && (d.active || isPeak);
              const ratio = d.amount > 0 ? d.amount / max : 0;
              let barColor = barMuted;
              if (d.amount <= 0) {
                barColor = isDark
                  ? "rgba(201,164,108,0.12)"
                  : "rgba(154,107,47,0.1)";
              } else if (d.active || isPeak) {
                barColor = colors.accent;
              } else if (ratio >= 0.45) {
                barColor = barMid;
              }
              return (
                <View key={d.dayIndex} style={styles.col}>
                  {showLabel ? (
                    <Text
                      style={{
                        fontFamily: typography.fontSansMedium,
                        fontSize: 10,
                        color: colors.accentStrong,
                        marginBottom: 4,
                      }}
                      numberOfLines={1}
                    >
                      {formatINRCompact(d.amount)}
                    </Text>
                  ) : (
                    <View style={{ height: 16 }} />
                  )}
                  <View style={styles.barTrack}>
                    {d.empty ? (
                      <View
                        style={[
                          styles.barEmpty,
                          {
                            borderColor: isDark
                              ? "rgba(201,164,108,0.35)"
                              : "rgba(154,107,47,0.3)",
                            height: Math.max(36, chartH * 0.35),
                          },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: h || 4,
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.labels}>
            {days.map((d) => (
              <Text
                key={d.dayIndex}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontFamily: d.active
                    ? typography.fontSansSemi
                    : typography.fontSans,
                  fontSize: 11,
                  color: d.active ? colors.accentStrong : colors.textMuted,
                }}
              >
                {DAY_LABELS[d.dayIndex]}
              </Text>
            ))}
          </View>
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
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bar: {
    width: "72%",
    maxWidth: 28,
    borderRadius: radius.xs,
    minHeight: 4,
  },
  barEmpty: {
    width: "72%",
    maxWidth: 28,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  labels: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
  },
});
