import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing } from "@/src/design/tokens";

export default function AddExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.createExpense({
        merchant: merchant.trim(),
        amount: amount.replace(/,/g, ""),
        direction,
        paidAt: new Date().toISOString(),
        source: "manual",
        notes: notes.trim() || null,
      });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Manual entry" subtitle="Without a UPI screenshot" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >

          <Card variant="soft" style={{ gap: spacing.lg }}>
            <View>
              <Text variant="label">Merchant</Text>
              <Input
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Who did you pay?"
                style={{ marginTop: spacing.sm }}
              />
            </View>

            <View>
              <Text variant="label">Amount (INR)</Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={{ marginTop: spacing.sm }}
              />
            </View>

            <View style={styles.dirRow}>
              <Button
                title="Paid"
                variant={direction === "debit" ? "primary" : "ghost"}
                onPress={() => setDirection("debit")}
                style={{ flex: 1 }}
              />
              <Button
                title="Received"
                variant={direction === "credit" ? "secondary" : "ghost"}
                onPress={() => setDirection("credit")}
                style={{ flex: 1 }}
              />
            </View>

            <View>
              <Text variant="label">Notes</Text>
              <Input
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                style={{ marginTop: spacing.sm }}
              />
            </View>
          </Card>

          {error ? <Text color={colors.danger}>{error}</Text> : null}

          <Button
            title="Save expense"
            loading={loading}
            disabled={!merchant.trim() || !amount}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dirRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
