import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

const ERASE_RED = "#E53935";

type Step = "choose" | "newPin" | "confirmPin";

export default function RecoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { recoverResetPasscode, recoverClearAll, refreshAccountState } =
    useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const eraseEverything = () => {
    setError(null);
    Alert.alert("Erase everything?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Erase all",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          setError(null);
          try {
            // Phone lock / biometrics required before wipe
            await recoverClearAll();
            await refreshAccountState();
            router.replace("/(auth)/register");
          } catch (e) {
            setError(
              e instanceof ApiError
                ? e.message
                : e instanceof Error
                  ? e.message
                  : "Could not erase data.",
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const startReset = () => {
    setError(null);
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
        await recoverResetPasscode(pin);
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
              : "Recovery failed.",
        );
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [confirm, pin, step, recoverResetPasscode, router]);

  if (step === "choose") {
    return (
      <Screen style={{ paddingTop: insets.top }}>
        <AppHeader
          title="Forgot passcode"
          subtitle="Two ways to recover"
          backTo="/(auth)/login"
        />
        <View
          style={[
            styles.chooseBody,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <View style={styles.chooseSpacer} />

          {error ? (
            <Text
              color={colors.danger}
              style={{ textAlign: "center", marginBottom: spacing.md }}
            >
              {error}
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginBottom: spacing.md }}
            />
          ) : null}

          <View style={styles.bottomActions}>
            <OptionCard
              title="Reset passcode"
              onPress={startReset}
              disabled={loading}
            />
            <OptionCard
              title="Erase everything"
              onPress={eraseEverything}
              disabled={loading}
              danger
            />
          </View>
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
          <Text
            style={{
              fontFamily: typography.fontSansSemi,
              fontSize: 18,
              color: colors.text,
              textAlign: "center",
            }}
          >
            {step === "newPin" ? "New passcode" : "Confirm passcode"}
          </Text>
          <Text
            muted
            style={{
              marginTop: spacing.sm,
              textAlign: "center",
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {step === "newPin"
              ? "Choose 6 digits. Your phone lock is asked when you confirm."
              : "Re-enter the same 6 digits."}
          </Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.padBlock}>
          <PinPad
            value={step === "newPin" ? pin : confirm}
            onChange={(next) => {
              if (error) setError(null);
              if (step === "newPin") setPin(next);
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

          <Pressable
            onPress={() => {
              setError(null);
              if (step === "confirmPin") {
                setConfirm("");
                setPin("");
                setStep("newPin");
              } else {
                setPin("");
                setStep("choose");
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
        </View>
      </View>
    </Screen>
  );
}

function OptionCard({
  title,
  onPress,
  disabled,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const textColor = danger ? "#FFFFFF" : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: danger ? ERASE_RED : colors.bgElevated,
          borderColor: danger ? ERASE_RED : colors.border,
          borderWidth: danger ? 0 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontSansSemi,
          fontSize: 16,
          color: textColor,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  chooseBody: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  chooseSpacer: {
    flex: 1,
  },
  bottomActions: {
    gap: spacing.md,
  },
  option: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
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
  statusPlaceholder: { height: 18 },
  backLink: {
    alignSelf: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
