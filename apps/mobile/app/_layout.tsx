import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { AuthProvider, useAuth } from "@/src/features/auth/AuthContext";
import { ThemeProvider, useTheme } from "@/src/design/ThemeContext";
import { isSmsConsentPending } from "@/src/features/sms/prefs";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { token, ready, hasAccount } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      const inAuth = segments[0] === "(auth)";
      const authScreen = segments[1];
      const appScreen = segments[1];

      if (token) {
        const needsConsent = await isSmsConsentPending();
        if (cancelled) return;

        if (needsConsent) {
          if (appScreen !== "sms-consent") {
            router.replace("/(app)/sms-consent");
          }
          return;
        }

        if (appScreen === "sms-consent") {
          router.replace("/(app)");
          return;
        }

        if (inAuth) router.replace("/(app)");
        return;
      }

      // Locked / signed out
      if (!inAuth) {
        router.replace(hasAccount ? "/(auth)/login" : "/(auth)/register");
        return;
      }

      // Has account → only passcode login (no re-register)
      if (hasAccount && authScreen === "register") {
        router.replace("/(auth)/login");
      }
      // No account → force create account (not recover)
      if (!hasAccount && (authScreen === "login" || authScreen === "recover")) {
        router.replace("/(auth)/register");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, ready, hasAccount, segments, router]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

function ThemedRoot() {
  const { colors, isDark } = useTheme();

  // Keep React Navigation's canvas color in sync so stack pops don't flash a
  // blank/default background while the previous scene reattaches.
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.bg,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
      },
    };
  }, [colors, isDark]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavigationThemeProvider value={navigationTheme}>
        <AuthProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg, flex: 1 },
                animation: "fade",
                freezeOnBlur: false,
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </NavigationThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
