import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ParsedExpense } from "@paymenttracker/shared";
import { ApiError, api } from "@/src/api/client";
import { CategoryChips } from "@/src/components/CategoryChips";
import { Badge, Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";

export default function ImportReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ imageUri?: string; payload?: string }>();

  const initial = useMemo(() => {
    try {
      return JSON.parse(String(params.payload ?? "{}")) as ParsedExpense;
    } catch {
      return null;
    }
  }, [params.payload]);

  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [paidAt, setPaidAt] = useState(
    initial?.paidAt
      ? new Date(initial.paidAt).toISOString()
      : new Date().toISOString()
  );
  const [upiRef, setUpiRef] = useState(initial?.upiRef ?? "");
  const [direction, setDirection] = useState<"debit" | "credit">(
    initial?.direction ?? "debit"
  );
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const source =
    initial?.source === "phonepe" || initial?.source === "gpay"
      ? initial.source
      : "manual";

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/import");
  };

  const save = async () => {
    setError(null);
    if (!merchant.trim() || !amount) {
      setError("Merchant and amount are required");
      return;
    }
    if (initial?.status === "failed") {
      setError("This transaction looks failed — not saved.");
      return;
    }
    setLoading(true);
    try {
      await api.createExpense({
        merchant: merchant.trim(),
        amount: String(amount).replace(/,/g, ""),
        direction,
        paidAt: new Date(paidAt).toISOString(),
        source: source === "manual" ? "manual" : source,
        upiRef: upiRef.trim() || null,
        notes: notes.trim() || null,
        categoryId,
        rawOcrText: initial?.rawText ?? null,
      });
      router.replace("/(app)");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          e.message.includes("already")
            ? e.message
            : "Duplicate — this payment looks already saved."
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Could not save");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!initial) {
    return (
      <Screen
        style={{
          padding: spacing.xl,
          paddingTop: insets.top + spacing.xl,
        }}
      >
        <Text>Missing parse data.</Text>
        <Button
          title="Back to import"
          variant="secondary"
          onPress={() => router.replace("/(app)/import")}
          style={{ marginTop: spacing.lg }}
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, paddingHorizontal: spacing.xl },
        ]}
      >
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backChip,
            { backgroundColor: colors.bgMuted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ fontFamily: typography.fontSansSemi }}>← Back</Text>
        </Pressable>
        <Text variant="title">Review</Text>
      </View>

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
          <Text muted>
            Confirm fields, then save. Duplicates (same merchant + amount on the
            same day) are blocked.
          </Text>

          {params.imageUri ? (
            <Image
              source={{ uri: String(params.imageUri) }}
              style={[styles.preview, { backgroundColor: colors.bgCard }]}
              resizeMode="contain"
            />
          ) : null}

          <View style={styles.badges}>
            <Badge
              label={source === "manual" ? "Unknown source" : source}
              tone="accent"
            />
            <Badge
              label={`${Math.round((initial.confidence ?? 0) * 100)}% confidence`}
              tone={
                (initial.confidence ?? 0) >= 0.7
                  ? "success"
                  : (initial.confidence ?? 0) >= 0.4
                    ? "warning"
                    : "neutral"
              }
            />
          </View>

          {initial.warnings?.length ? (
            <Card variant="outline" style={styles.warnBox}>
              {initial.warnings.map((w) => (
                <Text key={w} color={colors.warning} style={{ marginBottom: 4 }}>
                  {w}
                </Text>
              ))}
            </Card>
          ) : null}

          <Card variant="soft" style={{ gap: spacing.lg }}>
            <Field label="Merchant">
              <Input value={merchant} onChangeText={setMerchant} />
            </Field>
            <Field label="Amount (INR)">
              <Input
                value={amount ?? ""}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </Field>
            <Field label="When">
              <Input
                value={paidAt}
                onChangeText={setPaidAt}
                autoCapitalize="none"
              />
            </Field>
            <Field label="UPI reference (optional)">
              <Input
                value={upiRef}
                onChangeText={setUpiRef}
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Category">
              <CategoryChips value={categoryId} onChange={setCategoryId} />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChangeText={setNotes} />
            </Field>
          </Card>

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

          {error ? <Text color={colors.danger}>{error}</Text> : null}

          <Button title="Save expense" loading={loading} onPress={save} />

          {initial.rawText ? (
            <>
              <Button
                title={showRaw ? "Hide OCR text" : "Show OCR text"}
                variant="link"
                onPress={() => setShowRaw((v) => !v)}
              />
              {showRaw ? (
                <Card variant="outline">
                  <Text muted style={{ fontSize: 12, lineHeight: 18 }}>
                    {initial.rawText.slice(0, 1000)}
                    {initial.rawText.length > 1000 ? "…" : ""}
                  </Text>
                </Card>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  preview: {
    width: "100%",
    height: 160,
    borderRadius: radius.xl,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  warnBox: {
    borderColor: "rgba(212,176,90,0.35)",
  },
  dirRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
