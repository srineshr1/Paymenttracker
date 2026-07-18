import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { typography } from "@/src/design/tokens";

export type DonutSlice = {
  value: number;
  color: string;
};

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
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  const arcs =
    total <= 0
      ? null
      : slices
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const len = (s.value / total) * c;
            const dashoffset = -offset;
            offset += len;
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={colors.bgMuted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {arcs}
        </G>
      </Svg>
      <View
        style={{
          position: "absolute",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 8,
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
  );
}
