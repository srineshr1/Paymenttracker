import { Stack } from "expo-router";
import { Platform, View } from "react-native";
import { enableFreeze } from "react-native-screens";
import { BRAND_SPLASH_BG } from "@/src/components/BrandLoading";
import { useTheme } from "@/src/design/ThemeContext";
import { useAuth } from "@/src/features/auth/AuthContext";
import { SmsAutoImportHost } from "@/src/features/sms/SmsAutoImportHost";

// Freezing inactive screens blanks the previous scene on back (esp. Android +
// New Arch) when Reanimated overlays were mounted. Keep the JS tree warm.
enableFreeze(false);

export default function AppLayout() {
  const { colors, isDark } = useTheme();
  const { token } = useAuth();

  // Hard gate: never mount app screens without an unlocked session.
  // Solid brand color matches native splash so boot never flashes a 2nd UI.
  if (!token) {
    return <View style={{ flex: 1, backgroundColor: BRAND_SPLASH_BG }} />;
  }

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
        <Stack.Screen name="sms-consent" options={{ gestureEnabled: false }} />
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
