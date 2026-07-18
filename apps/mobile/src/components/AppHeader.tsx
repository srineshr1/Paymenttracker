import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing } from "@/src/design/tokens";

type Props = {
  title: string;
  subtitle?: string;
  /** Where back goes when the stack is empty. Default: home */
  backTo?: string;
};

export function AppHeader({ title, subtitle, backTo = "/(app)" }: Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();

  const onBack = useCallback(() => {
    // Prefer a real stack pop so the previous screen is restored in-place
    // (state + Reanimated views stay mounted). router.replace remounts Home
    // and looks like the page "cleared".
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
    } catch {
      // ignore — fall through
    }
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      // canGoBack can throw in rare edge cases during transitions
    }
    router.replace(backTo as never);
  }, [navigation, router, backTo]);

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
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.titles}>
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
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
});
