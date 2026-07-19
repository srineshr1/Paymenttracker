import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppLogo } from "@/src/components/AppLogo";
import { PinPad } from "@/src/components/PinPad";
import { Button, Screen, Text } from "@/src/components/ui";
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

  useEffect(() => {
    if (!hasAccount) {
      router.replace("/(auth)/register");
    }
  }, [hasAccount, router]);

  useEffect(() => {
    if (passcode.length !== 6 || submitting.current) return;

    const pin = passcode;
    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await unlock(pin);
      } catch (e) {
        setPasscode("");
        if (e instanceof ApiError) {
          if (e.status === 401) {
            setError("Incorrect passcode");
          } else if (e.status === 404) {
            setError("No account found");
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
          setError("Could not unlock");
        }
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [passcode, unlock, refreshAccountState, router]);

  if (!hasAccount) {
    return (
      <Screen style={styles.screen}>
        <View
          style={[
            styles.center,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingHorizontal: spacing.xl,
            },
          ]}
        >
          <AppLogo size={56} />
          <Text variant="display" style={{ marginTop: spacing.lg }}>
            Spentd
          </Text>
          <Button
            title="Create account"
            style={{ marginTop: spacing.xxl, alignSelf: "stretch" }}
            onPress={() => router.replace("/(auth)/register")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <View style={styles.top}>
          <AppLogo size={48} />
          <Text
            style={{
              marginTop: spacing.md,
              fontFamily: typography.fontSansMedium,
              fontSize: 16,
              color: colors.textSecondary,
            }}
          >
            {rememberedUsername
              ? `Welcome back, ${rememberedUsername}`
              : "Welcome back"}
          </Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.padBlock}>
          <PinPad
            value={passcode}
            onChange={(next) => {
              if (error) setError(null);
              setPasscode(next);
            }}
            disabled={loading}
          />

          <View style={styles.status}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : error ? (
              <Text
                color={colors.danger}
                style={{ textAlign: "center", fontSize: 14 }}
              >
                {error}
              </Text>
            ) : (
              <View style={styles.statusPlaceholder} />
            )}
          </View>

          <Pressable
            onPress={() => router.push("/(auth)/recover")}
            hitSlop={16}
            style={styles.forgot}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontSansMedium,
                fontSize: 14,
              }}
            >
              Forgot passcode?
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  top: {
    alignItems: "center",
    paddingTop: spacing.md,
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xl,
  },
  padBlock: {
    alignItems: "center",
    paddingBottom: spacing.sm,
  },
  status: {
    minHeight: 24,
    marginTop: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPlaceholder: {
    height: 18,
  },
  forgot: {
    alignSelf: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
