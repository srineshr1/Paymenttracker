import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Stack,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { BRAND_SPLASH_BG } from "@/src/components/BrandLoading";
import { ThemeProvider, useTheme } from "@/src/design/ThemeContext";
import { AuthProvider, useAuth } from "@/src/features/auth/AuthContext";
import { isSmsConsentPending } from "@/src/features/sms/prefs";

export { ErrorBoundary } from "expo-router";

// Keep the native splash (logo only) until we are on the real first screen.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Single boot gate:
 * - Native splash stays up the whole time (logo once).
 * - Redirects to passcode / register / app under the splash.
 * - Hides splash only when the destination screen is mounted.
 * User should only ever see: logo → passcode (or register / home).
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { token, ready, hasAccount } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const splashHidden = useRef(false);

  const group = segments[0];
  const screen = segments[1];
  const inAuth = group === "(auth)";
  const inApp = group === "(app)";

  // Navigate under the splash — user never sees intermediate loaders.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      if (token) {
        const needsConsent = await isSmsConsentPending();
        if (cancelled) return;

        if (needsConsent) {
          if (screen !== "sms-consent") {
            router.replace("/(app)/sms-consent");
          }
          return;
        }

        if (screen === "sms-consent") {
          router.replace("/(app)");
          return;
        }

        if (inAuth) router.replace("/(app)");
        return;
      }

      // Locked — force passcode or create-account
      if (!inAuth) {
        router.replace(hasAccount ? "/(auth)/login" : "/(auth)/register");
        return;
      }

      if (hasAccount && screen === "register") {
        router.replace("/(auth)/login");
      }
      if (!hasAccount && (screen === "login" || screen === "recover")) {
        router.replace("/(auth)/register");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, ready, hasAccount, inAuth, screen, router]);

  // True only when the first real screen the user should see is mounted.
  const destinationReady = useMemo(() => {
    if (!ready) return false;

    if (token) {
      // Unlocked: home (or consent) is fine to reveal
      if (!inApp) return false;
      return true;
    }

    // Locked: only reveal auth once we're on login / register / recover
    if (!inAuth) return false;
    return screen === "login" || screen === "register" || screen === "recover";
  }, [ready, token, inApp, inAuth, screen]);

  useEffect(() => {
    if (!destinationReady || splashHidden.current) return;
    splashHidden.current = true;
    // Wait one frame so passcode UI paints under the splash, then lift it.
    const id = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    });
    return () => cancelAnimationFrame(id);
  }, [destinationReady]);

  // Under the native splash: keep router children alive for replace(),
  // but paint the same solid brand color (no second animated logo).
  if (!destinationReady) {
    return (
      <View style={{ flex: 1, backgroundColor: BRAND_SPLASH_BG }}>
        <View
          style={{ width: 0, height: 0, overflow: "hidden" }}
          pointerEvents="none"
        >
          {children}
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

function ThemedRoot() {
  const { colors, isDark } = useTheme();

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
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: BRAND_SPLASH_BG }}
    >
      <NavigationThemeProvider value={navigationTheme}>
        <AuthProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: BRAND_SPLASH_BG,
                  flex: 1,
                },
                // No fade on boot — avoid a third “loading” frame
                animation: "none",
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

  // Do NOT hide the splash here — AuthGate hides it once passcode is ready.
  if (!loaded) return null;

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
