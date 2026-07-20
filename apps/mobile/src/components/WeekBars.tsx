import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
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
  /** Called when user swipes to another week */
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
};

type Pt = { x: number; y: number; amount: number; empty: boolean; active: boolean };

function LineSegment({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: midX - length / 2,
        top: midY - 1.25,
        width: length,
        height: 2.5,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

export function WeekBars({
  days,
  onPrevWeek,
  onNextWeek,
  canGoPrev = true,
  canGoNext = false,
}: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const chartH = 132;
  const padX = 10;
  const padTop = 22;
  const padBottom = 10;
  const plotH = chartH - padTop - padBottom;

  const max = Math.max(1, ...days.map((d) => (d.empty ? 0 : d.amount)));

  const points: Pt[] = useMemo(() => {
    if (width <= 0 || days.length === 0) return [];
    const innerW = width - padX * 2;
    const n = days.length;
    return days.map((d, i) => {
      const x = padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const ratio = d.empty || d.amount <= 0 ? 0 : d.amount / max;
      // Zero-spend days sit on the baseline; future days too
      const y = padTop + plotH * (1 - ratio);
      return {
        x,
        y,
        amount: d.amount,
        empty: !!d.empty,
        active: !!d.active,
      };
    });
  }, [days, width, max, padX, padTop, plotH]);

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
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      "worklet";
      if (e.translationX > 48) {
        runOnJS(goPrev)();
      } else if (e.translationX < -48) {
        runOnJS(goNext)();
      }
    });

  // Only connect consecutive non-future points (include zero days so the line continues)
  const segments: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.empty || b.empty) continue;
    segments.push({ a, b });
  }

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
        <View style={styles.gestureArea} onLayout={onLayout}>
          <View style={[styles.chart, { height: chartH }]}>
            {/* subtle baseline */}
            {width > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.baseline,
                  {
                    top: padTop + plotH,
                    left: padX,
                    right: padX,
                    backgroundColor: colors.border,
                  },
                ]}
              />
            ) : null}

            {/* connecting lines */}
            {segments.map(({ a, b }, i) => (
              <LineSegment
                key={`seg-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                color={colors.accent}
              />
            ))}

            {/* dots + amount labels */}
            {points.map((p, i) => {
              const d = days[i];
              const showAmt = !p.empty && p.amount > 0 && (p.active || p.amount === max);
              const size = p.active ? 12 : 9;
              return (
                <View key={d.dayIndex} pointerEvents="none">
                  {showAmt ? (
                    <Text
                      style={{
                        position: "absolute",
                        left: p.x - 28,
                        top: Math.max(0, p.y - 20),
                        width: 56,
                        textAlign: "center",
                        fontFamily: typography.fontSansMedium,
                        fontSize: 10,
                        color: colors.textSecondary,
                      }}
                      numberOfLines={1}
                    >
                      {formatINRCompact(p.amount)}
                    </Text>
                  ) : null}

                  {p.empty ? (
                    <View
                      style={{
                        position: "absolute",
                        left: p.x - 5,
                        top: p.y - 5,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        borderWidth: 1.5,
                        borderStyle: "dashed",
                        borderColor: colors.borderStrong,
                        backgroundColor: "transparent",
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        position: "absolute",
                        left: p.x - size / 2,
                        top: p.y - size / 2,
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor:
                          p.amount > 0
                            ? p.active
                              ? colors.accentStrong
                              : colors.accent
                            : colors.bgMuted,
                        borderWidth: p.amount > 0 ? 2 : 1.5,
                        borderColor:
                          p.amount > 0 ? colors.bgCard : colors.borderStrong,
                        shadowColor: colors.accent,
                        shadowOpacity: p.active ? 0.45 : 0,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: p.active ? 3 : 0,
                      }}
                    />
                  )}
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
    marginBottom: 2,
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
  gestureArea: {
    width: "100%",
  },
  chart: {
    width: "100%",
    position: "relative",
  },
  baseline: {
    position: "absolute",
    height: StyleSheet.hairlineWidth,
  },
  labels: {
    flexDirection: "row",
    marginTop: spacing.sm,
  },
});
