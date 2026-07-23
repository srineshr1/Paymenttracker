import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { typography } from "@/src/design/tokens";

export type DonutSlice = {
  value: number;
  color: string;
};

/**
 * Category spend donut — built on react-native-gifted-charts PieChart
 * (same library as the weekly line chart) so segments are smooth SVG arcs
 * instead of stacked View wedges.
 */
export function DonutChart({
  slices,
  size = 140,
  strokeWidth = 22,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors, isDark } = useTheme();

  const data = useMemo(() => {
    const positive = slices.filter((s) => s.value > 0);
    if (!positive.length) {
      return [{ value: 1, color: colors.bgMuted }];
    }
    return positive.map((s) => ({
      value: s.value,
      color: s.color,
    }));
  }, [slices, colors.bgMuted]);

  const hasData = slices.some((s) => s.value > 0);
  const radius = size / 2;
  const innerRadius = Math.max(8, radius - strokeWidth);
  // Hairline gap between slices so colors don't bleed together
  const gapColor = colors.bgCard;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PieChart
        data={data}
        donut
        radius={radius}
        innerRadius={innerRadius}
        innerCircleColor={colors.bgCard}
        backgroundColor="transparent"
        strokeWidth={hasData ? 2 : 0}
        strokeColor={gapColor}
        isAnimated
        animationDuration={600}
        initialAngle={-Math.PI / 2}
        showText={false}
        focusOnPress={false}
        sectionAutoFocus={false}
        centerLabelComponent={() => (
          <View style={styles.center}>
            {centerLabel ? (
              <Text
                style={{
                  fontFamily: typography.fontSans,
                  fontSize: 11,
                  color: colors.textMuted,
                  textAlign: "center",
                }}
              >
                {centerLabel}
              </Text>
            ) : null}
            {centerValue ? (
              <Text
                style={{
                  fontFamily: typography.fontSansBold,
                  fontSize: size >= 150 ? 17 : 15,
                  color: hasData ? colors.text : colors.textMuted,
                  marginTop: 2,
                  textAlign: "center",
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {centerValue}
              </Text>
            ) : null}
            {!hasData && !centerValue ? (
              <Text
                style={{
                  fontFamily: typography.fontSans,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                —
              </Text>
            ) : null}
          </View>
        )}
        // Soft ambient ring under the chart on dark themes
        shadow={isDark}
        shadowColor={isDark ? "rgba(0,0,0,0.35)" : "transparent"}
        shadowWidth={isDark ? 8 : 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    maxWidth: 96,
  },
});
