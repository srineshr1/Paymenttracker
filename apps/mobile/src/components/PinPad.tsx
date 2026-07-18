import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing, typography } from "@/src/design/tokens";

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
  const { colors } = useTheme();

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
                  backgroundColor: filled
                    ? colors.text
                    : "transparent",
                  borderColor: filled ? colors.text : colors.textMuted,
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
                <View key={ki} style={styles.key} />
              ) : (
                <Pressable
                  key={ki}
                  disabled={disabled}
                  onPress={() => press(key)}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.key,
                    pressed && !disabled && { opacity: 0.35 },
                    disabled && { opacity: 0.35 },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: typography.fontSansMedium,
                      fontSize: key === "⌫" ? 22 : 28,
                      color: colors.text,
                      letterSpacing: key === "⌫" ? 0 : 0.5,
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
    gap: spacing.xxl,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  pad: {
    width: "100%",
    maxWidth: 280,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  key: {
    width: 72,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
});
