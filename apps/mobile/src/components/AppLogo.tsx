import { Image, StyleSheet, View, type ViewStyle } from "react-native";

const logo = require("../../assets/images/logo.png");

type Props = {
  /** Outer size in dp */
  size?: number;
  style?: ViewStyle;
  /** Soft square without OS mask rounding (default true) */
  rounded?: boolean;
};

export function AppLogo({ size = 56, style, rounded = true }: Props) {
  const r = rounded ? Math.round(size * 0.225) : 0;
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: r,
        },
        style,
      ]}
    >
      <Image
        source={logo}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
        accessibilityLabel="Spentd"
      />
    </View>
  );
}

/** Compact mark for headers / inline brand row */
export function AppLogoMark({ size = 28, style }: Omit<Props, "rounded">) {
  return <AppLogo size={size} rounded style={style} />;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
});
