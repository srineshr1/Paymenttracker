import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppLogo } from "@/src/components/AppLogo";
import { PinPad } from "@/src/components/PinPad";
import { Button, Card, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { unlock, hasAccount, rememberedUsername, refreshAccountState } =
    useAuth();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  // No profile on device → create account (don't strand on unlock UI)
  useEffect(() => {
    if (!hasAccount) {
      router.replace("/(auth)/register");
    }
  }, [hasAccount, router]);

  useEffect(() => {
    if (passcode.length !== 6 || submitting.current) return;

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await unlock(passcode);
      } catch (e) {
        setPasscode("");
        if (e instanceof ApiError) {
          if (e.status === 401) {
            setError("Incorrect passcode. Try again.");
          } else if (e.status === 404) {
            setError("No account found. Create one to continue.");
            await refreshAccountState();
            router.replace("/(auth)/register");
          } else {
            setError(e.message);
          }
        } else if (e instanceof Error) {
          setError(e.message);
          if (e.message.toLowerCase().includes("no account")) {
            await refreshAccountState();
            router.replace("/(auth)/register");
          }
        } else {
          setError("Could not unlock. Try again.");
        }
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [passcode, unlock, refreshAccountState, router]);

  const greeting = rememberedUsername
    ? `Welcome back, ${rememberedUsername}`
    : "Welcome back";

  // Brief moment while redirecting to register
  if (!hasAccount) {
    return (
      <Screen style={{ paddingTop: insets.top + spacing.xl }}>
        <View style={[styles.brand, { paddingHorizontal: spacing.xl }]}>
          <AppLogo size={64} style={{ marginBottom: spacing.sm }} />
          <Text variant="display">Spentd</Text>
          <Text muted style={{ marginTop: spacing.md, textAlign: "center" }}>
            Setting up…
          </Text>
          <Button
            title="Create account"
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
            onPress={() => router.replace("/(auth)/register")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingTop: insets.top + spacing.xl }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <AppLogo size={64} style={{ marginBottom: spacing.sm }} />
            <Text variant="display">Spentd</Text>
            <Text
              muted
              style={{
                marginTop: spacing.sm,
                maxWidth: 300,
                textAlign: "center",
              }}
            >
              {greeting}
            </Text>
          </View>

          <Card variant="soft" style={{ gap: spacing.lg }}>
            <View>
              <Text variant="label">Passcode</Text>
              <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
                Enter your 6-digit passcode to unlock.
              </Text>
              <PinPad
                value={passcode}
                onChange={setPasscode}
                disabled={loading}
              />
            </View>

            {error ? (
              <Text
                color={colors.danger}
                style={{ textAlign: "center", lineHeight: 20 }}
              >
                {error}
              </Text>
            ) : null}

            <Pressable
              onPress={() => router.push("/(auth)/recover")}
              hitSlop={12}
              style={{ alignSelf: "center", marginTop: spacing.sm }}
            >
              <Text
                style={{
                  color: colors.accentStrong,
                  fontFamily: typography.fontSansSemi,
                  fontSize: 14,
                }}
              >
                Forgot passcode?
              </Text>
            </Pressable>
          </Card>

          <View style={styles.footer}>
            <Text muted style={{ textAlign: "center", fontSize: 13 }}>
              Your data stays encrypted on this device.
            </Text>
            <Text
              muted
              style={{
                textAlign: "center",
                marginTop: spacing.md,
                fontSize: 11,
                fontFamily: typography.fontMono,
              }}
            >
              local · secure on-device
            </Text>
            {loading ? (
              <Button
                title="Unlocking…"
                loading
                style={{ marginTop: spacing.lg }}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
    gap: spacing.xxl,
  },
  brand: {
    alignItems: "center",
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  footer: {
    paddingBottom: spacing.lg,
  },
});
