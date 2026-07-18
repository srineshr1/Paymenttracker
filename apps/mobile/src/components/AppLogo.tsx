import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { radius } from "@/src/design/tokens";

const logo = require("../../assets/images/logo.png");

type Props = {
  /** Outer size in dp */
  size?: number;
  style?: ViewStyle;
  /** Soft square without OS mask rounding (default true) */
  rounded?: boolean;
};

export function AppLogo({ size = 56, style, rounded = true }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: rounded ? Math.round(size * 0.22) : 0,
        },
        style,
      ]}
    >
      <Image
        source={logo}
        style={{ width: size, height: size }}
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
    borderRadius: radius.md,
  },
});
