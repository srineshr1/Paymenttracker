import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from "react-native";
import { useTheme } from "@/src/design/ThemeContext";
import {
  cardShadow,
  radius,
  spacing,
  typography,
  type ColorTokens,
} from "@/src/design/tokens";
import { formatExpenseAmount } from "@/src/design/format";

export function Screen({
  children,
  style,
  ...rest
}: ViewProps & { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]} {...rest}>
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
    elevated: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      ...cardShadow(mode, colors.shadow),
    },
    outline: {
      backgroundColor: "transparent",
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
    },
    soft: {
      backgroundColor: colors.bgMuted,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    accent: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    hero: {
      backgroundColor: colors.heroWash,
      borderRadius: radius.xxl,
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
        borderRadius: radius.pill,
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
        borderRadius: radius.pill,
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
          borderRadius: radius.lg,
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
  return (
    <RNText
      style={{
        // Sans — mono fonts often render "," as a broken bar on Android
        fontFamily: typography.fontSansSemi,
        fontSize: sizes[size],
        letterSpacing: 0,
        color,
      }}
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

/** Segmented control — pill track, soft selected capsule */
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
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.bgMuted,
        borderRadius: radius.pill,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.bgCard : "transparent",
              alignItems: "center",
              borderWidth: active ? StyleSheet.hairlineWidth : 0,
              borderColor: colors.border,
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
