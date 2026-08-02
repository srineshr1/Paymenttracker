import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { PinPad } from "@/src/components/PinPad";
import { Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

type Step = "current" | "new" | "confirm";

const STEPS: Step[] = ["current", "new", "confirm"];

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

  const onChange = (v: string) => {
    if (error) setError(null);
    if (step === "current") setCurrent(v);
    else if (step === "new") setNext(v);
    else setConfirm(v);
  };

  const label =
    step === "current"
      ? "Current passcode"
      : step === "new"
        ? "New passcode"
        : "Confirm new passcode";

  const hint =
    step === "current"
      ? "Enter the 6 digits you use to unlock."
      : step === "new"
        ? "Choose a new 6-digit passcode."
        : "Re-enter the same 6 digits.";

  const stepIndex = STEPS.indexOf(step);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="Change passcode"
        subtitle="Unlocks encrypted data on this device"
        backTo="/(app)/settings"
      />

      <View
        style={[
          styles.root,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <View style={styles.top}>
          <View style={styles.stepRow}>
            {STEPS.map((s, i) => {
              const active = i === stepIndex;
              const done = i < stepIndex;
              return (
                <View
                  key={s}
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor:
                        active || done ? colors.accent : "transparent",
                      borderColor:
                        active || done ? colors.accent : colors.borderStrong,
                      opacity: done && !active ? 0.55 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>

          <Text
            style={{
              marginTop: spacing.lg,
              fontFamily: typography.fontSansSemi,
              fontSize: 18,
              color: colors.text,
              textAlign: "center",
            }}
          >
            {label}
          </Text>
          <Text
            muted
            style={{
              marginTop: spacing.sm,
              textAlign: "center",
              fontSize: 14,
              lineHeight: 20,
              maxWidth: 280,
            }}
          >
            {hint}
          </Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.padBlock}>
          <PinPad value={value} onChange={onChange} disabled={loading} />

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

          {step !== "current" ? (
            <Pressable
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
              disabled={loading}
              hitSlop={12}
              style={styles.backLink}
            >
              <Text
                style={{
                  fontFamily: typography.fontSansMedium,
                  fontSize: 14,
                  color: colors.textMuted,
                }}
              >
                Back
              </Text>
            </Pressable>
          ) : (
            <View style={styles.backLinkPlaceholder} />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  top: {
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
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
  backLink: {
    alignSelf: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backLinkPlaceholder: {
    height: 18 + spacing.lg + spacing.sm,
  },
});
