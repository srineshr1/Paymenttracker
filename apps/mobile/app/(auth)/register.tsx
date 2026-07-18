import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppLogo } from "@/src/components/AppLogo";
import { PinPad } from "@/src/components/PinPad";
import { Button, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
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
  const submitting = useRef(false);
  // Snapshot the create-PIN so confirm can't race with a cleared state.
  const createdPin = useRef("");

  useEffect(() => {
    if (step !== "pin" || passcode.length !== 6) return;
    createdPin.current = passcode;
    setConfirm("");
    setStep("confirm");
  }, [passcode, step]);

  useEffect(() => {
    if (step !== "confirm" || confirm.length !== 6 || submitting.current) return;

    const pin = createdPin.current;
    const confirmed = confirm;

    if (confirmed !== pin) {
      setError("Passcodes do not match");
      setConfirm("");
      return;
    }

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await register(username.trim(), pin);
      } catch (e) {
        const raw =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not create account.";
        const friendly =
          raw.includes("NullPointerException") ||
          raw.includes("prepareAsync") ||
          raw.includes("NativeDatabase")
            ? "Storage hiccup. Try again, or reload the app (shake → Reload)."
            : raw;
        setError(friendly);
        createdPin.current = "";
        setPasscode("");
        setConfirm("");
        setStep("pin");
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [confirm, register, username, step]);

  return (
    <Screen style={{ paddingTop: insets.top + spacing.xxl }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.top}>
            <AppLogo size={52} style={{ marginBottom: spacing.lg }} />
            <Text
              variant="display"
              style={{ fontSize: 34, lineHeight: 40, letterSpacing: -1 }}
            >
              Welcome to{"\n"}Spentd
            </Text>
            <Text
              muted
              style={{
                marginTop: spacing.md,
                maxWidth: 300,
                lineHeight: 22,
                fontSize: 15,
              }}
            >
              {step === "user"
                ? "Choose a username. You’ll unlock with a 6-digit passcode after this."
                : step === "pin"
                  ? "Create a 6-digit passcode. You’ll enter it every time you open the app."
                  : "Re-enter the same 6 digits to confirm."}
            </Text>

            {step === "user" ? (
              <View
                style={[
                  styles.featureCard,
                  {
                    backgroundColor: colors.bgMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: typography.fontSansSemi,
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 6,
                  }}
                >
                  Auto-updates from bank SMS
                </Text>
                <Text
                  muted
                  style={{ fontSize: 13, lineHeight: 19 }}
                >
                  Spentd can read bank and UPI messages on this phone to
                  track payments and keep your balance in sync. Everything
                  stays on your device — nothing is uploaded.
                </Text>
              </View>
            ) : null}

            {step === "user" ? (
              <View style={styles.form}>
                <Text
                  style={{
                    fontFamily: typography.fontSansMedium,
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginBottom: spacing.sm,
                  }}
                >
                  Username
                </Text>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    if (error) setError(null);
                  }}
                  placeholder="letters, numbers, underscore"
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    const name = username.trim();
                    if (name.length < 3) {
                      setError("Username needs at least 3 characters");
                      return;
                    }
                    setError(null);
                    setStep("pin");
                  }}
                  style={{
                    borderWidth: 0,
                    backgroundColor: colors.bgMuted,
                    borderRadius: radius.md,
                    minHeight: 56,
                  }}
                />
                <Button
                  title="Continue"
                  style={{
                    marginTop: spacing.md,
                    opacity: username.trim().length < 3 ? 0.55 : 1,
                  }}
                  onPress={() => {
                    const name = username.trim();
                    if (name.length < 3) {
                      setError("Username needs at least 3 characters");
                      return;
                    }
                    setError(null);
                    setStep("pin");
                  }}
                />
              </View>
            ) : (
              <View style={styles.pinBlock}>
                <Text
                  style={{
                    fontFamily: typography.fontSansSemi,
                    fontSize: 17,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: spacing.lg,
                  }}
                >
                  {step === "pin" ? "Create passcode" : "Confirm passcode"}
                </Text>
                <PinPad
                  value={step === "pin" ? passcode : confirm}
                  onChange={step === "pin" ? setPasscode : setConfirm}
                  disabled={loading}
                />
              </View>
            )}

            {error ? (
              <Text
                color={colors.danger}
                style={{ textAlign: "center", marginTop: spacing.md }}
              >
                {error}
              </Text>
            ) : null}
          </View>

          <View style={styles.footer}>
            {loading ? (
              <Button
                title="Creating…"
                loading
                style={{ marginBottom: spacing.lg }}
              />
            ) : null}
            <Text
              muted
              style={{
                textAlign: "center",
                fontSize: 12,
                letterSpacing: 0.3,
                color: colors.textMuted,
              }}
            >
              Local · secure on this device
            </Text>
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
  },
  top: {
    paddingTop: spacing.sm,
  },
  featureCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 360,
  },
  form: {
    marginTop: spacing.xl,
    width: "100%",
  },
  pinBlock: {
    marginTop: spacing.xl,
    alignItems: "center",
  },
  footer: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
});
