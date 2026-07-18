import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { PinPad } from "@/src/components/PinPad";
import { Button, Card, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

type Step = "choose" | "newPin" | "confirmPin";
type Action = "reset" | "clearHistory" | "clearAll";

export default function RecoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const {
    recoverResetPasscode,
    recoverClearHistory,
    recoverClearAll,
    refreshAccountState,
  } = useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [action, setAction] = useState<Action | null>(null);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const startAction = (next: Action) => {
    setError(null);
    if (next === "clearAll") {
      Alert.alert(
        "Erase everything?",
        "This deletes your account and all spending history on this device. You will create a new account.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Erase all",
            style: "destructive",
            onPress: async () => {
              setLoading(true);
              setError(null);
              try {
                await recoverClearAll();
                await refreshAccountState();
                router.replace("/(auth)/register");
              } catch (e) {
                setError(
                  e instanceof ApiError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Could not erase data."
                );
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
      return;
    }

    if (next === "clearHistory") {
      Alert.alert(
        "Clear spending history?",
        "All expenses will be deleted. Your name stays. You’ll set a new passcode next (phone lock required).",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear history",
            style: "destructive",
            onPress: () => {
              setAction("clearHistory");
              setPin("");
              setConfirm("");
              setStep("newPin");
            },
          },
        ]
      );
      return;
    }

    setAction("reset");
    setPin("");
    setConfirm("");
    setStep("newPin");
  };

  useEffect(() => {
    if (step !== "newPin" || pin.length !== 6) return;
    setStep("confirmPin");
  }, [pin, step]);

  useEffect(() => {
    if (step !== "confirmPin" || confirm.length !== 6 || submitting.current)
      return;
    if (!action || action === "clearAll") return;

    if (confirm !== pin) {
      setError("Passcodes do not match");
      setConfirm("");
      return;
    }

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        if (action === "reset") {
          await recoverResetPasscode(pin);
        } else {
          await recoverClearHistory(pin);
        }
        // Session unlocked → AuthGate sends to app
        router.replace("/(app)");
      } catch (e) {
        setPin("");
        setConfirm("");
        setStep("newPin");
        setError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Recovery failed."
        );
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [
    confirm,
    pin,
    step,
    action,
    recoverResetPasscode,
    recoverClearHistory,
    router,
  ]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="Forgot passcode"
        subtitle="Verify with your phone lock"
        backTo="/(auth)/login"
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + 40,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {step === "choose" ? (
            <>
              <Text muted style={{ lineHeight: 22 }}>
                Use your phone’s fingerprint, face, or lock-screen password.
                Then choose how to recover.
              </Text>

              <OptionCard
                title="Reset passcode"
                body="Keep all spending history. Set a new 6-digit app passcode."
                onPress={() => startAction("reset")}
                disabled={loading}
              />
              <OptionCard
                title="Clear history"
                body="Delete all expenses. Keep your name. Set a new passcode."
                onPress={() => startAction("clearHistory")}
                disabled={loading}
                danger
              />
              <OptionCard
                title="Erase everything"
                body="Delete account and data on this device. Start over."
                onPress={() => startAction("clearAll")}
                disabled={loading}
                danger
              />
            </>
          ) : (
            <Card variant="soft">
              <Text variant="label">
                {step === "newPin" ? "New passcode" : "Confirm passcode"}
              </Text>
              <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
                {step === "newPin"
                  ? "You’ll unlock Spentd with these 6 digits."
                  : "Re-enter the same 6 digits. Phone lock will be asked next."}
              </Text>
              <PinPad
                value={step === "newPin" ? pin : confirm}
                onChange={step === "newPin" ? setPin : setConfirm}
                disabled={loading}
              />
              <Button
                title="Back"
                variant="ghost"
                style={{ marginTop: spacing.lg }}
                disabled={loading}
                onPress={() => {
                  setError(null);
                  if (step === "confirmPin") {
                    setConfirm("");
                    setPin("");
                    setStep("newPin");
                  } else {
                    setAction(null);
                    setPin("");
                    setStep("choose");
                  }
                }}
              />
            </Card>
          )}

          {error ? (
            <Text color={colors.danger} style={{ textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          {loading ? <Button title="Working…" loading /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function OptionCard({
  title,
  body,
  onPress,
  disabled,
  danger,
}: {
  title: string;
  body: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: colors.bgElevated,
          borderColor: danger ? colors.danger : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontSansSemi,
          fontSize: 16,
          color: danger ? colors.danger : colors.text,
        }}
      >
        {title}
      </Text>
      <Text muted style={{ marginTop: 6, lineHeight: 20 }}>
        {body}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
