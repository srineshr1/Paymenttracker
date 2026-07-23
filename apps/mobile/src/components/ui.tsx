import type React from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  type PressableProps,
  Text as RNText,
  StyleSheet,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { formatExpenseAmount } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import {
  type ColorTokens,
  cardShadow,
  radius,
  spacing,
  typography,
} from "@/src/design/tokens";

export function Screen({
  children,
  style,
  ...rest
}: ViewProps & { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      // Android Fabric can drop inactive scene subtrees during stack pops
      // when the root is collapsable — keep the surface attached.
      collapsable={false}
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

type TextVariant =
  | "display"
  | "hero"
  | "title"
  | "subtitle"
  | "body"
  | "caption"
  | "label"
  | "mono";

export function Text({
  variant = "body",
  muted,
  color,
  style,
  ...rest
}: TextProps & {
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        { color: colors.text },
        textVariant(colors)[variant],
        muted && { color: colors.textSecondary },
        color ? { color } : null,
        style,
      ]}
      {...rest}
    />
  );
}

function textVariant(colors: ColorTokens) {
  return StyleSheet.create({
    display: {
      fontFamily: typography.fontDisplayBold,
      fontSize: 40,
      lineHeight: 46,
      letterSpacing: -1.2,
      color: colors.text,
    },
    hero: {
      fontFamily: typography.fontDisplay,
      fontSize: 32,
      lineHeight: 38,
      letterSpacing: -0.8,
      color: colors.text,
    },
    title: {
      fontFamily: typography.fontSansSemi,
      fontSize: 20,
      letterSpacing: -0.3,
      color: colors.text,
    },
    subtitle: {
      fontFamily: typography.fontSansMedium,
      fontSize: 16,
      color: colors.text,
    },
    body: {
      fontFamily: typography.fontSans,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
    caption: {
      fontFamily: typography.fontSans,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    label: {
      fontFamily: typography.fontSansSemi,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    mono: {
      fontFamily: typography.fontMonoMed,
      fontSize: 14,
      color: colors.text,
    },
  });
}

type CardVariant = "elevated" | "outline" | "soft" | "accent" | "hero";

export function Card({
  children,
  style,
  variant = "elevated",
  ...rest
}: ViewProps & { children: React.ReactNode; variant?: CardVariant }) {
  const { colors, mode } = useTheme();
  const base = {
    // Default cards — slightly squared
    elevated: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      ...cardShadow(mode, colors.shadow),
    },
    // Outlined panels — sharper
    outline: {
      backgroundColor: "transparent",
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
    },
    // Soft fills — a touch rounder
    soft: {
      backgroundColor: colors.bgMuted,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    // Accent rail — boxy with a hard left edge
    accent: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    // Hero spend card — restrained, not a bubble
    hero: {
      backgroundColor: colors.heroWash,
      borderRadius: radius.lg,
      padding: spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...cardShadow(mode, colors.shadow),
    },
  }[variant];

  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}

/**
 * Shape language by variant — do not make every button look the same:
 *  primary  → full pill capsule
 *  secondary → soft square
 *  ghost    → outlined sharp rectangle
 *  danger   → soft fill, tight corners
 *  link     → text only
 *  chip     → compact pill
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "link"
  | "chip";

export function Button({
  title,
  loading,
  variant = "primary",
  disabled,
  style,
  ...rest
}: PressableProps & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
}) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const shape = buttonShape(colors)[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        shape.container,
        pressed && !isDisabled && shape.pressed,
        isDisabled && { opacity: 0.42 },
        style as object,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={shape.spinner} />
      ) : (
        <RNText style={shape.label}>{title}</RNText>
      )}
    </Pressable>
  );
}

function buttonShape(colors: ColorTokens) {
  return {
    primary: {
      container: {
        minHeight: 54,
        paddingHorizontal: 28,
        borderRadius: radius.lg,
        backgroundColor: colors.accent,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      label: {
        fontFamily: typography.fontSansSemi,
        fontSize: 16,
        letterSpacing: 0.2,
        color: colors.accentOn,
      },
      pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
      spinner: colors.accentOn,
    },
    secondary: {
      container: {
        minHeight: 52,
        paddingHorizontal: 22,
        borderRadius: radius.md,
        backgroundColor: colors.bgMuted,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      label: {
        fontFamily: typography.fontSansMedium,
        fontSize: 15,
        color: colors.text,
      },
      pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
      spinner: colors.accent,
    },
    ghost: {
      container: {
        minHeight: 50,
        paddingHorizontal: 18,
        borderRadius: radius.sharp,
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: colors.borderStrong,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      label: {
        fontFamily: typography.fontSansMedium,
        fontSize: 15,
        color: colors.text,
      },
      pressed: { backgroundColor: colors.bgMuted },
      spinner: colors.accent,
    },
    danger: {
      container: {
        minHeight: 50,
        paddingHorizontal: 20,
        borderRadius: radius.sm,
        backgroundColor: colors.dangerSoft,
        borderWidth: 1,
        borderColor: colors.danger,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      label: {
        fontFamily: typography.fontSansSemi,
        fontSize: 15,
        color: colors.danger,
      },
      pressed: { opacity: 0.85 },
      spinner: colors.danger,
    },
    link: {
      container: {
        minHeight: 40,
        paddingHorizontal: 4,
        paddingVertical: 8,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      label: {
        fontFamily: typography.fontSansMedium,
        fontSize: 15,
        color: colors.accentStrong,
        textDecorationLine: "underline" as const,
      },
      pressed: { opacity: 0.7 },
      spinner: colors.accent,
    },
    chip: {
      container: {
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.sm,
        backgroundColor: colors.accentSoft,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        alignSelf: "flex-start" as const,
      },
      label: {
        fontFamily: typography.fontSansMedium,
        fontSize: 13,
        color: colors.accentStrong,
      },
      pressed: { opacity: 0.85 },
      spinner: colors.accent,
    },
  };
}

export function Input(props: TextInputProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[
        {
          minHeight: 52,
          borderRadius: radius.sm,
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
          backgroundColor: colors.bgElevated,
          paddingHorizontal: spacing.lg,
          color: colors.text,
          fontFamily: typography.fontSans,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}

export function Amount({
  amount,
  direction,
  size = "md",
}: {
  amount: string | number;
  direction: "debit" | "credit";
  size?: "sm" | "md" | "lg" | "hero";
}) {
  const { colors } = useTheme();
  const color = direction === "credit" ? colors.credit : colors.debit;
  const sizes = {
    sm: 15,
    md: 18,
    lg: 28,
    hero: 40,
  };
  const fontSize = sizes[size];
  return (
    <RNText
      style={{
        // Sans — mono fonts often render "," as a broken bar on Android
        fontFamily: typography.fontSansSemi,
        fontSize,
        // Keep commas/figures from being clipped at large sizes (Android)
        lineHeight: Math.round(fontSize * 1.3),
        letterSpacing: 0,
        color,
      }}
      numberOfLines={1}
    >
      {formatExpenseAmount(amount, direction)}
    </RNText>
  );
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.bgMuted, fg: colors.textSecondary },
    accent: { bg: colors.accentSoft, fg: colors.accentStrong },
    success: { bg: "rgba(47,138,102,0.12)", fg: colors.credit },
    warning: { bg: "rgba(212,176,90,0.14)", fg: colors.warning },
  }[tone];

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.xs,
        backgroundColor: map.bg,
        alignSelf: "flex-start",
      }}
    >
      <RNText
        style={{
          fontFamily: typography.fontSansMedium,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: map.fg,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        paddingVertical: spacing.xxxl,
        paddingHorizontal: spacing.xl,
        alignItems: "center",
      }}
    >
      <Text variant="hero" style={{ textAlign: "center", fontSize: 26 }}>
        {title}
      </Text>
      <Text muted style={{ textAlign: "center", marginTop: spacing.sm }}>
        {body}
      </Text>
      {action ? <View style={{ marginTop: spacing.xl }}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacing.md,
      }}
    />
  );
}

const SEG_PAD = 3;
const SEG_GAP = 3;
const SEG_SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

/** Segmented control — sliding pill selection (System / Light / Dark style). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const [trackW, setTrackW] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const n = Math.max(1, options.length);
  const pillW = trackW > 0 ? (trackW - SEG_PAD * 2 - SEG_GAP * (n - 1)) / n : 0;

  const translateX = useSharedValue(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pillW <= 0) return;
    const x = SEG_PAD + index * (pillW + SEG_GAP);
    if (!ready) {
      translateX.value = x;
      setReady(true);
      return;
    }
    translateX.value = withSpring(x, SEG_SPRING);
  }, [index, pillW, ready, translateX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillW,
  }));

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onTrackLayout}
      style={{
        flexDirection: "row",
        backgroundColor: colors.bgMuted,
        borderRadius: radius.sm,
        padding: SEG_PAD,
        gap: SEG_GAP,
        position: "relative",
      }}
    >
      {pillW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: SEG_PAD,
              bottom: SEG_PAD,
              left: 0,
              borderRadius: radius.xs,
              backgroundColor: colors.bgCard,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            },
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: radius.xs,
              alignItems: "center",
              zIndex: 1,
            }}
          >
            <RNText
              style={{
                fontFamily: active
                  ? typography.fontSansSemi
                  : typography.fontSansMedium,
                fontSize: 13,
                color: active ? colors.text : colors.textSecondary,
              }}
            >
              {opt.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
