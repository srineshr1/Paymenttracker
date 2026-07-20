import { Stack } from "expo-router";
import { BRAND_SPLASH_BG } from "@/src/components/BrandLoading";
import { useTheme } from "@/src/design/ThemeContext";

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg ?? BRAND_SPLASH_BG },
        // Instant on cold start — no fade that looks like another load screen
        animation: "none",
      }}
    />
  );
}
