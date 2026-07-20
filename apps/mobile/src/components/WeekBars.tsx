import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LineChart } from "react-native-gifted-charts";
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

export function WeekBars({
  days,
  onPrevWeek,
  onNextWeek,
  canGoPrev = true,
  canGoNext = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

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

  const maxVal = Math.max(1, ...days.map((d) => (d.empty ? 0 : d.amount)));
  // Nice headroom so the peak doesn’t clip
  const chartMax = Math.ceil(maxVal * 1.18) || 1;

  const chartData = useMemo(
    () =>
      days.map((d) => {
        const value = d.empty ? 0 : d.amount;
        const isPeak = !d.empty && value > 0 && value === maxVal;
        const showLabel = d.active || isPeak;
        return {
          value,
          label: DAY_LABELS[d.dayIndex],
          labelTextStyle: {
            color: d.active ? colors.accentStrong : colors.textMuted,
            fontFamily: d.active
              ? typography.fontSansSemi
              : typography.fontSans,
            fontSize: 11,
          },
          dataPointColor: d.empty
            ? "transparent"
            : d.active
              ? colors.accentStrong
              : colors.accent,
          dataPointRadius: d.empty ? 0 : d.active ? 6 : 4.5,
          hideDataPoint: !!d.empty,
          // Peak / today amount bubble
          dataPointText: showLabel && value > 0 ? formatINRCompact(value) : "",
          textColor: colors.textSecondary,
          textFontSize: 10,
          textShiftY: -10,
          textShiftX: -6,
        };
      }),
    [days, colors, maxVal],
  );

  // Chart width: full card minus a little; gifted-charts draws y-axis gutter
  const chartWidth = Math.max(0, width - 8);
  const hasSpend = days.some((d) => !d.empty && d.amount > 0);

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
        <View style={styles.chartHost} onLayout={onLayout}>
          {width > 0 ? (
            hasSpend ? (
              <LineChart
                key={days.map((d) => d.amount).join("-")}
                data={chartData}
                areaChart
                curved
                curvature={0.18}
                height={148}
                width={chartWidth}
                adjustToWidth
                initialSpacing={12}
                endSpacing={12}
                maxValue={chartMax}
                noOfSections={3}
                hideRules={false}
                rulesType="dashed"
                rulesColor={
                  isDark ? "rgba(244,240,232,0.08)" : "rgba(20,22,28,0.08)"
                }
                rulesThickness={1}
                dashWidth={4}
                dashGap={6}
                yAxisThickness={0}
                xAxisThickness={0}
                yAxisColor="transparent"
                xAxisColor="transparent"
                hideYAxisText
                yAxisLabelWidth={0}
                disableScroll
                isAnimated
                animateOnDataChange
                onDataChangeAnimationDuration={420}
                color={colors.accent}
                thickness={2.75}
                startFillColor={colors.accent}
                endFillColor={colors.accent}
                startOpacity={isDark ? 0.38 : 0.28}
                endOpacity={0.02}
                dataPointsHeight={12}
                dataPointsWidth={12}
                dataPointsRadius={4.5}
                dataPointsColor={colors.accent}
                focusedDataPointRadius={7}
                focusedDataPointColor={colors.accentStrong}
                textFontSize={10}
                textColor={colors.textSecondary}
                backgroundColor="transparent"
                overflowTop={18}
                overflowBottom={4}
                // Soft glow pointer on press
                pointerConfig={{
                  pointerStripHeight: 130,
                  pointerStripColor: isDark
                    ? "rgba(201,164,108,0.22)"
                    : "rgba(154,107,47,0.18)",
                  pointerStripWidth: 2,
                  pointerColor: colors.accentStrong,
                  radius: 6,
                  pointerLabelWidth: 88,
                  pointerLabelHeight: 36,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: { value?: number }[]) => {
                    const v = items?.[0]?.value ?? 0;
                    return (
                      <View
                        style={[
                          styles.pointerLabel,
                          {
                            backgroundColor: colors.bgElevated,
                            borderColor: colors.borderStrong,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontFamily: typography.fontSansSemi,
                            fontSize: 12,
                            color: colors.text,
                          }}
                        >
                          {formatINRCompact(v)}
                        </Text>
                      </View>
                    );
                  },
                }}
              />
            ) : (
              <EmptyWeekChart
                days={days}
                width={chartWidth}
                colors={colors}
                isDark={isDark}
              />
            )
          ) : (
            <View style={{ height: 168 }} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

/** Zero-spend state: soft baseline + day labels, not a flat broken line. */
function EmptyWeekChart({
  days,
  width,
  colors,
  isDark,
}: {
  days: WeekDayBar[];
  width: number;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
}) {
  return (
    <View style={{ width, height: 168, justifyContent: "flex-end" }}>
      <View
        style={[
          styles.emptyPlot,
          {
            borderColor: isDark
              ? "rgba(244,240,232,0.08)"
              : "rgba(20,22,28,0.08)",
          },
        ]}
      >
        <View
          style={[
            styles.emptyLine,
            {
              backgroundColor: isDark
                ? "rgba(201,164,108,0.25)"
                : "rgba(154,107,47,0.22)",
            },
          ]}
        />
        <View style={styles.emptyDots}>
          {days.map((d) => (
            <View
              key={d.dayIndex}
              style={[
                styles.emptyDot,
                {
                  backgroundColor: d.active
                    ? colors.accent
                    : d.empty
                      ? "transparent"
                      : colors.bgMuted,
                  borderColor: d.empty
                    ? colors.borderStrong
                    : d.active
                      ? colors.accentStrong
                      : colors.borderStrong,
                  borderStyle: d.empty ? "dashed" : "solid",
                },
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.emptyLabels}>
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
      <Text
        muted
        style={{
          textAlign: "center",
          fontSize: 12,
          marginTop: spacing.sm,
        }}
      >
        No spend this week — swipe for last week
      </Text>
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
  chartHost: {
    width: "100%",
    minHeight: 168,
  },
  pointerLabel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  emptyPlot: {
    height: 100,
    marginHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyLine: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
    top: "55%",
  },
  emptyDots: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  emptyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  emptyLabels: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
});
