import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
] as const;

export function PinPad({
  value,
  onChange,
  length = 6,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
}) {
  const { colors, mode } = useTheme();

  const press = async (key: string) => {
    if (disabled) return;
    await Haptics.selectionAsync().catch(() => undefined);
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    if (!/^\d$/.test(key)) return;
    onChange(value + key);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  borderColor: filled ? colors.accent : colors.borderStrong,
                  backgroundColor: filled ? colors.accent : "transparent",
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.pad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ki) =>
              key === "" ? (
                <View key={ki} style={styles.keySpacer} />
              ) : (
                <Pressable
                  key={ki}
                  disabled={disabled}
                  onPress={() => press(key)}
                  style={({ pressed }) => [
                    styles.key,
                    {
                      backgroundColor: pressed
                        ? colors.pinKeyPressed
                        : colors.pinKey,
                      borderColor: colors.border,
                      // Mix of shapes: backspace is round, digits are squircle
                      borderRadius:
                        key === "⌫" ? radius.pill : radius.lg,
                      ...(mode === "light"
                        ? {
                            shadowColor: colors.shadow,
                            shadowOpacity: 0.06,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 1,
                          }
                        : null),
                    },
                    disabled && { opacity: 0.4 },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: typography.fontMonoMed,
                      fontSize: key === "⌫" ? 20 : 24,
                      color: colors.text,
                    }}
                  >
                    {key}
                  </Text>
                </Pressable>
              )
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    gap: spacing.xl,
  },
  dots: {
    flexDirection: "row",
    gap: 14,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 3,
    borderWidth: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  pad: {
    width: "100%",
    maxWidth: 320,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  key: {
    flex: 1,
    aspectRatio: 1.35,
    maxHeight: 68,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  keySpacer: {
    flex: 1,
    aspectRatio: 1.35,
    maxHeight: 68,
  },
});
