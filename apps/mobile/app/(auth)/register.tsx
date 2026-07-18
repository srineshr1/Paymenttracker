import { Link } from "expo-router";
import { useEffect, useState } from "react";
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
import { spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"user" | "pin" | "confirm">("user");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== "pin" || passcode.length !== 6) return;
    setStep("confirm");
  }, [passcode, step]);

  useEffect(() => {
    if (step !== "confirm" || confirm.length !== 6 || loading) return;
    (async () => {
      if (confirm !== passcode) {
        setError("Passcodes do not match");
        setConfirm("");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        await register(username.trim(), passcode);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not create account."
        );
        setPasscode("");
        setConfirm("");
        setStep("pin");
      } finally {
        setLoading(false);
      }
    })();
  }, [confirm, passcode, register, username, step, loading]);

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
          <View>
            <Text variant="display" style={{ fontSize: 36 }}>
              Create{"\n"}account
            </Text>
            <Text muted style={{ marginTop: spacing.md, maxWidth: 320 }}>
              Username is remembered. Passcode is not — and cannot be recovered
              in this version.
            </Text>
          </View>

          {step === "user" ? (
            <Card variant="outline" style={{ gap: spacing.lg }}>
              <View>
                <Text variant="label">Username</Text>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="letters, numbers, underscore"
                  style={{ marginTop: spacing.sm }}
                />
              </View>
              <Button
                title="Continue"
                disabled={username.trim().length < 3}
                onPress={() => {
                  setError(null);
                  setStep("pin");
                }}
              />
            </Card>
          ) : (
            <Card variant="soft">
              <Text variant="label">
                {step === "pin" ? "Create passcode" : "Confirm passcode"}
              </Text>
              <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
                {step === "pin"
                  ? "You will enter this every time you open the app."
                  : "Re-enter the same 6 digits."}
              </Text>
              <PinPad
                value={step === "pin" ? passcode : confirm}
                onChange={step === "pin" ? setPasscode : setConfirm}
                disabled={loading}
              />
            </Card>
          )}

          {error ? (
            <Text color={colors.danger} style={{ textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Text muted style={{ textAlign: "center" }}>
              Already have an account?{" "}
              <Link
                href="/(auth)/login"
                style={{
                  color: colors.accentStrong,
                  fontFamily: typography.fontSansSemi,
                }}
              >
                Sign in
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
                title="Creating…"
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
  footer: {
    paddingBottom: spacing.lg,
  },
});
