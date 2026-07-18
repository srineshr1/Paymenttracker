import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, getApiBase } from "@/src/api/client";
import { PinPad } from "@/src/components/PinPad";
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { login, rememberedUsername } = useAuth();
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (rememberedUsername) setUsername(rememberedUsername);
  }, [rememberedUsername]);

  useEffect(() => {
    if (passcode.length !== 6 || submitting.current) return;
    if (username.trim().length < 3) {
      setError("Enter a username (at least 3 characters) first.");
      setPasscode("");
      return;
    }

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await login(username.trim(), passcode);
      } catch (e) {
        setPasscode("");
        if (e instanceof ApiError) {
          if (e.status === 401) {
            setError(
              "Invalid username or passcode. New here? Create an account first."
            );
          } else {
            setError(e.message);
          }
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Could not sign in. Try again.");
        }
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [passcode, login, username]);

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
            <View
              style={[
                styles.mark,
                { backgroundColor: colors.accentSoft, borderColor: colors.border },
              ]}
            >
              <Text
                style={{
                  fontFamily: typography.fontDisplayBold,
                  fontSize: 22,
                  color: colors.accentStrong,
                }}
              >
                L
              </Text>
            </View>
            <Text variant="display">Ledger</Text>
            <Text
              muted
              style={{ marginTop: spacing.sm, maxWidth: 300, textAlign: "center" }}
            >
              Private expense tracking from PhonePe & GPay screenshots.
            </Text>
          </View>

          <Card variant="soft" style={{ gap: spacing.lg }}>
            <View>
              <Text variant="label">Username</Text>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(t) => {
                  setUsername(t);
                  setError(null);
                }}
                placeholder="your_name"
                style={{ marginTop: spacing.sm }}
              />
            </View>

            <View>
              <Text variant="label">Passcode</Text>
              <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
                Six digits. Never stored on this device.
              </Text>
              <PinPad
                value={passcode}
                onChange={setPasscode}
                disabled={loading || username.trim().length < 3}
              />
            </View>

            {username.trim().length < 3 ? (
              <Text muted style={{ textAlign: "center" }}>
                Type your username (3+ characters) to unlock the pad.
              </Text>
            ) : null}

            {error ? (
              <Text
                color={colors.danger}
                style={{ textAlign: "center", lineHeight: 20 }}
              >
                {error}
              </Text>
            ) : null}
          </Card>

          <View style={styles.footer}>
            <Text muted style={{ textAlign: "center" }}>
              New here?{" "}
              <Link
                href="/(auth)/register"
                style={{
                  color: colors.accentStrong,
                  fontFamily: typography.fontSansSemi,
                }}
              >
                Create account
              </Link>
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
              {getApiBase()}
            </Text>
            {loading ? (
              <Button
                title="Signing in…"
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
  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    transform: [{ rotate: "-4deg" }],
  },
  footer: {
    paddingBottom: spacing.lg,
  },
});
