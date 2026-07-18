import { Platform } from "react-native";
import { Stack } from "expo-router";
import { enableFreeze } from "react-native-screens";
import { useTheme } from "@/src/design/ThemeContext";
import { SmsAutoImportHost } from "@/src/features/sms/SmsAutoImportHost";

// Freezing inactive screens blanks the previous scene on back (esp. Android +
// New Arch) when Reanimated overlays were mounted. Keep the JS tree warm.
enableFreeze(false);

export default function AppLayout() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <SmsAutoImportHost />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.bg,
            flex: 1,
          },
          // Fade avoids Android native-stack leaving the previous scene undrawn
          // during slide_from_right pops (looks like the page "deleted").
          animation: Platform.OS === "android" ? "fade" : "slide_from_right",
          animationDuration: Platform.OS === "ios" ? 280 : 200,
          freezeOnBlur: false,
          navigationBarColor: colors.bg,
          statusBarStyle: isDark ? "light" : "dark",
          statusBarBackgroundColor: colors.bg,
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
        <Stack.Screen name="edit-username" />
        <Stack.Screen name="change-passcode" />
      </Stack>
    </>
  );
}
