import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

type Props = {
  title: string;
  subtitle?: string;
  /** Where back goes when the stack is empty. Default: home */
  backTo?: string;
};

export function AppHeader({ title, subtitle, backTo = "/(app)" }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const onBack = useCallback(() => {
    // Prefer a real stack pop so the previous screen keeps its state
    // (avoids a blank remount). Fall back to replace when there's no history.
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      // canGoBack can throw in rare edge cases during transitions
    }
    router.replace(backTo as never);
  }, [router, backTo]);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [
          styles.back,
          {
            backgroundColor: colors.bgMuted,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={{ fontFamily: typography.fontSansSemi, fontSize: 15 }}>
          ← Back
        </Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="title" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text muted style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
});
