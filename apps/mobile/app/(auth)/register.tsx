import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const createdPin = useRef("");

  useEffect(() => {
    if (step !== "pin" || passcode.length !== 6) return;
    createdPin.current = passcode;
    setConfirm("");
    setError(null);
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

  if (step === "user") {
    return (
      <Screen style={{ paddingTop: insets.top + spacing.xxl }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.userContent,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            <View>
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
                Choose a username. You’ll unlock with a 6-digit passcode after
                this.
              </Text>

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
                {error ? (
                  <Text
                    color={colors.danger}
                    style={{ textAlign: "center", marginTop: spacing.md }}
                  >
                    {error}
                  </Text>
                ) : null}
              </View>
            </View>

            <Text
              muted
              style={{
                textAlign: "center",
                fontSize: 12,
                letterSpacing: 0.3,
                color: colors.textMuted,
                marginTop: spacing.xxl,
              }}
            >
              Local · secure on this device
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // pin + confirm — same placement as login numpad
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
              textAlign: "center",
            }}
          >
            {step === "pin" ? "Create a 6-digit passcode" : "Confirm passcode"}
          </Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.padBlock}>
          <PinPad
            value={step === "pin" ? passcode : confirm}
            onChange={(next) => {
              if (error) setError(null);
              if (step === "pin") setPasscode(next);
              else setConfirm(next);
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

          <Text
            muted
            style={{
              textAlign: "center",
              fontSize: 12,
              letterSpacing: 0.3,
              color: colors.textMuted,
              paddingTop: spacing.lg,
              paddingBottom: spacing.sm,
            }}
          >
            Local · secure on this device
          </Text>
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
  userContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
  },
  form: {
    marginTop: spacing.xxl,
    width: "100%",
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
});
