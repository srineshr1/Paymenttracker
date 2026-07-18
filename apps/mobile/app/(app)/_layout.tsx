import { Stack } from "expo-router";
import { useTheme } from "@/src/design/ThemeContext";

export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
        animationDuration: 280,
        // Keep previous screens live so Reanimated FAB/menu state and list
        // content don't blank out when popping back.
        freezeOnBlur: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="expenses/index" />
      <Stack.Screen name="expenses/[id]" />
      <Stack.Screen name="import/index" />
      <Stack.Screen name="import/select" />
      <Stack.Screen name="import/review" />
      <Stack.Screen name="add" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
