import { useRouter } from "expo-router";
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
import { AppHeader } from "@/src/components/AppHeader";
import { PinPad } from "@/src/components/PinPad";
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function EditUsernameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, updateUsername } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [passcode, setPasscode] = useState("");
  const [step, setStep] = useState<"name" | "pin">("name");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const canContinue =
    username.trim().length >= 3 &&
    username.trim().toLowerCase() !== (user?.username ?? "");

  useEffect(() => {
    if (step !== "pin" || passcode.length !== 6 || submitting.current) return;

    submitting.current = true;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        await updateUsername(username.trim(), passcode);
        router.back();
      } catch (e) {
        setPasscode("");
        if (e instanceof ApiError) {
          setError(e.message);
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Could not update username.");
        }
      } finally {
        setLoading(false);
        submitting.current = false;
      }
    })();
  }, [passcode, step, updateUsername, username, router]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="Edit username"
        subtitle="Confirm with your passcode"
        backTo="/(app)/settings"
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + 40,
            gap: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {step === "name" ? (
            <Card variant="outline" style={{ gap: spacing.lg }}>
              <View>
                <Text variant="label">New username</Text>
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    setError(null);
                  }}
                  placeholder="letters, numbers, underscore"
                  style={{ marginTop: spacing.sm }}
                />
              </View>
              <Text muted>
                Current: {user?.username}. You’ll confirm with your 6-digit
                passcode next.
              </Text>
              <Button
                title="Continue"
                disabled={!canContinue}
                onPress={() => {
                  setError(null);
                  setPasscode("");
                  setStep("pin");
                }}
              />
            </Card>
          ) : (
            <Card variant="soft">
              <Text variant="label">Confirm passcode</Text>
              <Text muted style={{ marginTop: 4, marginBottom: spacing.lg }}>
                Enter your current passcode to save “{username.trim()}”.
              </Text>
              <PinPad
                value={passcode}
                onChange={setPasscode}
                disabled={loading}
              />
              <Button
                title="Back"
                variant="ghost"
                style={{ marginTop: spacing.lg }}
                disabled={loading}
                onPress={() => {
                  setPasscode("");
                  setError(null);
                  setStep("name");
                }}
              />
            </Card>
          )}

          {error ? (
            <Text color={colors.danger} style={{ textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          {loading ? (
            <Button title="Saving…" loading style={styles.loading} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: spacing.sm,
  },
});
