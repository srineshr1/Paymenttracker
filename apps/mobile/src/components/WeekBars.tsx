import { StyleSheet, View } from "react-native";
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

export function WeekBars({ days }: { days: WeekDayBar[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...days.map((d) => d.amount));
  const chartH = 120;

  return (
    <View style={styles.wrap}>
      <View style={[styles.chart, { height: chartH }]}>
        {days.map((d) => {
          const h =
            d.empty || d.amount <= 0
              ? 0
              : Math.max(8, (d.amount / max) * (chartH - 28));
          const showLabel = d.active && d.amount > 0;
          return (
            <View key={d.dayIndex} style={styles.col}>
              {showLabel ? (
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 10,
                    color: colors.textSecondary,
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
                        borderColor: colors.borderStrong,
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
                        backgroundColor: d.active
                          ? colors.accent
                          : colors.bgMuted,
                        opacity: d.amount > 0 ? 1 : 0.35,
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
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
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
  },
});
