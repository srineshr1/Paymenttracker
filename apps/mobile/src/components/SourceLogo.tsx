import { Ionicons } from "@expo/vector-icons";
import { Image, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/src/design/ThemeContext";

const logos = {
  phonepe: require("../../assets/images/brands/phonepe.png"),
  gpay: require("../../assets/images/brands/gpay.png"),
  manual: require("../../assets/images/brands/manual.png"),
} as const;

type Source = "phonepe" | "gpay" | "sms" | "manual" | "cash" | string;

export function SourceLogo({
  source,
  size = 44,
}: {
  source: Source;
  size?: number;
}) {
  const { colors } = useTheme();

  if (source === "sms") {
    return (
      <View
        style={[
          styles.wrap,
          {
            width: size,
            height: size,
            borderRadius: Math.max(10, size * 0.28),
            borderColor: colors.border,
            backgroundColor: colors.accentSoft,
          },
        ]}
      >
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={Math.round(size * 0.48)}
          color={colors.accentStrong}
          accessibilityLabel="SMS"
        />
      </View>
    );
  }

  if (source === "cash") {
    return (
      <View
        style={[
          styles.wrap,
          {
            width: size,
            height: size,
            borderRadius: Math.max(10, size * 0.28),
            borderColor: colors.border,
            backgroundColor: colors.bgMuted,
          },
        ]}
      >
        <Ionicons
          name="cash-outline"
          size={Math.round(size * 0.48)}
          color={colors.text}
          accessibilityLabel="Cash"
        />
      </View>
    );
  }

  // App-agnostic payment (any UPI / wallet app, or brand not detected).
  if (source === "upi" || source === "unknown") {
    return (
      <View
        style={[
          styles.wrap,
          {
            width: size,
            height: size,
            borderRadius: Math.max(10, size * 0.28),
            borderColor: colors.border,
            backgroundColor: colors.accentSoft,
          },
        ]}
      >
        <Ionicons
          name="wallet-outline"
          size={Math.round(size * 0.48)}
          color={colors.accentStrong}
          accessibilityLabel="Payment app"
        />
      </View>
    );
  }

  const key =
    source === "phonepe" || source === "gpay" || source === "manual"
      ? source
      : "manual";

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.max(10, size * 0.28),
          borderColor: colors.border,
          backgroundColor: colors.bgMuted,
        },
      ]}
    >
      <Image
        source={logos[key]}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(10, size * 0.28),
        }}
        resizeMode="cover"
        accessibilityLabel={key}
      />
    </View>
  );
}

/** Centered vector icon chip for action menus */
export function IconChip({
  name,
  color,
  bg,
  size = 36,
  iconSize = 18,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Fixed box + Android font-padding fix so glyphs sit optically centered */}
      <View
        style={{
          width: iconSize,
          height: iconSize,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={name}
          size={iconSize}
          color={color}
          style={{
            width: iconSize,
            height: iconSize,
            textAlign: "center",
            ...Platform.select({
              android: {
                includeFontPadding: false,
                textAlignVertical: "center",
              },
              default: {},
            }),
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
