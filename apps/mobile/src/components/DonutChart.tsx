import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { typography } from "@/src/design/tokens";

export type DonutSlice = {
  value: number;
  color: string;
};

/** Half-disc wedge used to build multi-segment rings without SVG. */
function Wedge({
  size,
  color,
  sweepDeg,
}: {
  size: number;
  color: string;
  /** 0–180 */
  sweepDeg: number;
}) {
  if (sweepDeg <= 0.05) return null;
  const r = size / 2;
  // Clamp tiny sweeps so the bar still paints
  const sweep = Math.min(180, Math.max(sweepDeg, 0.5));

  return (
    <View style={{ width: size, height: size, position: "absolute" }}>
      <View
        style={{
          width: size,
          height: size,
          overflow: "hidden",
          transform: [{ rotate: `${sweep - 180}deg` }],
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            overflow: "hidden",
            transform: [{ rotate: `${180 - sweep}deg` }],
          }}
        >
          <View
            style={{
              width: size,
              height: r,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: size,
                height: size,
                borderRadius: r,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function Segment({
  size,
  color,
  startDeg,
  sweepDeg,
}: {
  size: number;
  color: string;
  startDeg: number;
  sweepDeg: number;
}) {
  if (sweepDeg <= 0.05) return null;

  // Split >180° into two half wedges
  const first = Math.min(sweepDeg, 180);
  const second = Math.max(0, sweepDeg - 180);

  return (
    <View
      style={{
        position: "absolute",
        width: size,
        height: size,
        transform: [{ rotate: `${startDeg}deg` }],
      }}
    >
      <Wedge size={size} color={color} sweepDeg={first} />
      {second > 0 ? (
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            transform: [{ rotate: `${first}deg` }],
          }}
        >
          <Wedge size={size} color={color} sweepDeg={second} />
        </View>
      ) : null}
    </View>
  );
}

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
  const { colors } = useTheme();
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const hole = size - strokeWidth * 2;

  let cursor = -90; // start at 12 o'clock
  const segments =
    total <= 0
      ? null
      : slices
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const sweep = (s.value / total) * 360;
            const start = cursor;
            cursor += sweep;
            return (
              <Segment
                key={i}
                size={size}
                color={s.color}
                startDeg={start}
                sweepDeg={sweep}
              />
            );
          });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.bgMuted,
          },
        ]}
      >
        {segments}
        <View
          style={{
            position: "absolute",
            width: hole,
            height: hole,
            borderRadius: hole / 2,
            backgroundColor: colors.bgCard,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
          }}
        >
          {centerLabel ? (
            <Text
              style={{
                fontFamily: typography.fontSans,
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              {centerLabel}
            </Text>
          ) : null}
          {centerValue ? (
            <Text
              style={{
                fontFamily: typography.fontSansBold,
                fontSize: 16,
                color: colors.text,
                marginTop: 2,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {centerValue}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
