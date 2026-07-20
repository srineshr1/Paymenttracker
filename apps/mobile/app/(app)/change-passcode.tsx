import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { PinPad } from "@/src/components/PinPad";
import { Button, Card, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

type Step = "current" | "new" | "confirm";

export default function ChangePasscodeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { changePasscode } = useAuth();
  const [step, setStep] = useState<Step>("current");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (step !== "current" || current.length !== 6) return;
    setError(null);
    setStep("new");
  }, [current, step]);

  useEffect(() => {
    if (step !== "new" || next.length !== 6) return;
    if (next === current) {
      setError("New passcode must be different");
      setNext("");
      return;
    }
    setError(null);
    setStep("confirm");
  }, [next, step, current]);

  useEffect(() => {
    if (step !== "confirm" || confirm.length !== 6 || submitting.current)
      return;

    if (confirm !== next) {
      setError("Passcodes do not match");
      setConfirm("");
      return;
    }

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await changePasscode(current, next);
        router.back();
      } catch (e) {
        setCurrent("");
        setNext("");
        setConfirm("");
        setStep("current");
        if (e instanceof ApiError) {
          setError(e.message);
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Could not change passcode.");
        }
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [confirm, next, current, step, changePasscode, router]);

  const value = step === "current" ? current : step === "new" ? next : confirm;
  const onChange =
    step === "current" ? setCurrent : step === "new" ? setNext : setConfirm;

  const label =
    step === "current"
      ? "Current passcode"
      : step === "new"
        ? "New passcode"
        : "Confirm new passcode";

  const hint =
    step === "current"
      ? "Enter the 6 digits you use to sign in."
      : step === "new"
        ? "Choose a new 6-digit passcode."
        : "Re-enter the same 6 digits.";

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="Change passcode"
        subtitle="Unlocks encrypted data on this device"
        backTo="/(app)/settings"
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 40,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="soft">
          <Text variant="label">{label}</Text>
          <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
            {hint}
          </Text>
          <PinPad value={value} onChange={onChange} disabled={loading} />
          {step !== "current" ? (
            <Button
              title="Back"
              variant="ghost"
              style={{ marginTop: spacing.lg }}
              disabled={loading}
              onPress={() => {
                setError(null);
                if (step === "confirm") {
                  setConfirm("");
                  setNext("");
                  setStep("new");
                } else {
                  setNext("");
                  setCurrent("");
                  setStep("current");
                }
              }}
            />
          ) : null}
        </Card>

        {error ? (
          <Text color={colors.danger} style={{ textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <Button title="Updating…" loading style={styles.loading} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: spacing.sm,
  },
});
