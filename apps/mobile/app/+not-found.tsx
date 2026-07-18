import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing, typography } from "@/src/design/tokens";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Missing", headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text variant="hero">Screen not found</Text>
        <Link href="/" style={styles.link}>
          <Text color={colors.accentStrong}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  link: {
    fontFamily: typography.fontSansMedium,
  },
});
