import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/src/components/ui";
import { typography } from "@/src/design/tokens";

const logo = require("../../assets/images/logo.png");
const mark = require("../../assets/images/splash-icon.png");

/** Matches native splash background (app.json). */
export const BRAND_SPLASH_BG = "#0E1014";
const MINT = "#34D399";

type Props = {
  /** Show wordmark under the mark */
  showWordmark?: boolean;
  /** Optional status line under the mark */
  caption?: string | null;
};

/**
 * Full-screen brand loading — same look as the native splash so the
 * handoff after SplashScreen.hideAsync() feels seamless.
 */
export function BrandLoading({
  showWordmark = true,
  caption = null,
}: Props) {
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0.35);
  const bar = useSharedValue(0.15);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.04, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(1, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    bar.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0.15, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
  }, [pulse, glow, bar]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.9 + glow.value * 0.25 }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: 18 + bar.value * 102,
    opacity: 0.45 + bar.value * 0.45,
  }));

  return (
    <View style={styles.root} accessibilityLabel="Loading Spentd">
      <View style={styles.center}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={markStyle}>
          <Image
            source={mark}
            style={styles.mark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>

        {showWordmark ? (
          <Text style={styles.wordmark} accessibilityRole="header">
            Spentd
          </Text>
        ) : null}

        {caption ? (
          <Text style={styles.caption}>{caption}</Text>
        ) : null}

        <View style={styles.track}>
          <Animated.View style={[styles.fill, barStyle]} />
        </View>
      </View>
    </View>
  );
}

/** Compact logo tile for in-app use (settings, about). */
export function BrandLogoTile({ size = 72 }: { size?: number }) {
  return (
    <Image
      source={logo}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
      }}
      resizeMode="cover"
      accessibilityLabel="Spentd"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 40,
  },
  glow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: MINT,
    // Soft bloom behind the mark
    opacity: 0.2,
  },
  mark: {
    width: 96,
    height: 96,
  },
  wordmark: {
    marginTop: 28,
    fontFamily: typography.fontDisplay,
    fontSize: 32,
    letterSpacing: -0.6,
    color: "#F4F0E8",
  },
  caption: {
    marginTop: 10,
    fontFamily: typography.fontSans,
    fontSize: 14,
    color: "rgba(244,240,232,0.45)",
  },
  track: {
    marginTop: 36,
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(244,240,232,0.08)",
    overflow: "hidden",
    alignSelf: "center",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: MINT,
  },
});
