import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui";
import { formatDateTime } from "@/src/design/format";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

export function DateField({
  value,
  onChange,
  label = "When",
}: {
  value: Date;
  onChange: (d: Date) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"date" | "time">("date");

  const onPick = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "dismissed" || !selected) return;
      if (mode === "date") {
        const next = new Date(value);
        next.setFullYear(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate()
        );
        onChange(next);
        // Open time after date on Android
        setMode("time");
        setTimeout(() => setOpen(true), 200);
      } else {
        const next = new Date(value);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        onChange(next);
        setMode("date");
      }
      return;
    }
    if (selected) onChange(selected);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        style={{
          fontFamily: typography.fontSansMedium,
          fontSize: 13,
          color: colors.textSecondary,
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={() => {
          setMode("date");
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.bgMuted,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text
          style={{
            fontFamily: typography.fontSansMedium,
            fontSize: 15,
            color: colors.text,
          }}
        >
          {formatDateTime(value.toISOString())}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value}
          mode={Platform.OS === "ios" ? "datetime" : mode}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPick}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Pressable onPress={() => setOpen(false)} style={{ padding: spacing.sm }}>
          <Text style={{ color: colors.accentStrong, textAlign: "center" }}>
            Done
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
});
