import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Category } from "@paymenttracker/shared";
import { api } from "@/src/api/client";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

export function CategoryChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    void api.listCategories().then((r) => setCats(r.categories)).catch(() => {});
  }, []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Chip
        label="None"
        active={value == null}
        color={colors.textSecondary}
        onPress={() => onChange(null)}
      />
      {cats.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          active={value === c.id}
          color={c.color}
          onPress={() => onChange(c.id)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? color + "33" : colors.bgMuted,
          borderColor: active ? color : colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={{
          fontFamily: typography.fontSansMedium,
          fontSize: 13,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
