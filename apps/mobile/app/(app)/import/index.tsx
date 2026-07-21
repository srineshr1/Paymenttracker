import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  isFastOcrAvailable,
  parseScreenshotAll,
  recognizeTextFromImage,
} from "@/src/features/ocr/recognize";
import { TesseractHost } from "@/src/features/ocr/TesseractHost";
import {
  enableSmsAutoImport,
  getSmsAutoImportEnabled,
} from "@/src/features/sms/autoImport";
import { importAndSavePaymentsFromSms } from "@/src/features/sms/importSms";
import { isSmsInboxAvailable } from "@/src/features/sms/readInbox";

const SAMPLE_PHONEPE = `PhonePe
Payment Successful
₹450.00
Paid to Swiggy
Transaction ID
T2407171234567890123456
17 Jul 2026, 08:42 pm
UPI Ref No. 417612345678
Debited from
HDFC Bank XX1234`;

type Picked = {
  id: string;
  uri: string;
  base64: string;
  mimeType: string;
};

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const { runWithoutAppLock } = useAuth();
  const fastOcr = useMemo(() => isFastOcrAvailable(), []);
  const autoSmsStarted = useRef(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const goReview = (imageUri: string | null, text: string) => {
    const all = parseScreenshotAll(text);
    if (all.length > 1) {
      router.push({
        pathname: "/(app)/import/select",
        params: {
          imageUri: imageUri ?? "",
          list: JSON.stringify(all),
          rawText: text,
        },
      });
      return;
    }
    const parsed = all[0] ?? parseScreenshotAll(text)[0];
    router.push({
      pathname: "/(app)/import/review",
      params: {
        imageUri: imageUri ?? "",
        payload: JSON.stringify({
          ...parsed,
          rawText: text,
        }),
      },
    });
  };

  const runOcr = async (assets: Picked[]) => {
    if (!assets.length) {
      setError("Choose a screenshot first.");
      return;
    }

    setError(null);
    setBusy(true);
    setStatus(
      assets.length > 1
        ? `Reading ${assets.length} screenshots…`
        : fastOcr
          ? "Reading text on this device…"
          : "Reading screenshot… first time may take a moment",
    );

    try {
      const texts: string[] = [];
      for (let i = 0; i < assets.length; i++) {
        if (assets.length > 1) {
          setStatus(`Reading screenshot ${i + 1} of ${assets.length}…`);
        }
        const { text } = await recognizeTextFromImage({
          uri: assets[i].uri,
          base64: assets[i].base64 || null,
          mimeType: assets[i].mimeType,
        });
        if (text.trim()) texts.push(text.trim());
      }

      if (!texts.length) {
        throw new Error(
          "No text found in these images. Try clearer screenshots or paste text.",
        );
      }

      setStatus(null);
      goReview(assets[0]?.uri ?? null, texts.join("\n\n"));
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Could not read this image.");
      setShowPaste(true);
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async () => {
    setError(null);
    setStatus(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Gallery permission is required to pick a screenshot.");
      return;
    }

    // Gallery backgrounds the app — don't treat that as "leave app → lock".
    const result = await runWithoutAppLock(() =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        base64: true,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      }),
    );
    if (result.canceled || !result.assets?.length) return;

    const added: Picked[] = result.assets.map((asset, i) => ({
      id: `${Date.now()}-${i}-${asset.uri}`,
      uri: asset.uri,
      base64: asset.base64 ?? "",
      mimeType: asset.mimeType ?? "image/jpeg",
    }));

    const next = [...picked, ...added].slice(0, 8);
    setPicked(next);
  };

  const removePicked = (id: string) => {
    setPicked((prev) => prev.filter((p) => p.id !== id));
    setError(null);
  };

  const parsePaste = () => {
    if (!pasteText.trim()) return;
    setError(null);
    goReview(null, pasteText);
  };

  const scanSms = async () => {
    setError(null);
    setStatus(null);

    if (Platform.OS !== "android") {
      setError("SMS import is only available on Android.");
      return;
    }
    if (!isSmsInboxAvailable()) {
      setError(
        "SMS import needs the Spentd APK (not Expo Go). Install from GitHub Releases or run: npx expo run:android",
      );
      return;
    }

    setBusy(true);
    setStatus("Scanning messages…");
    try {
      const result = await importAndSavePaymentsFromSms(
        { lookbackDays: 90, maxCount: 2000 },
        (msg) => setStatus(msg),
      );

      if (result.considered === 0 && result.created === 0) {
        setError(
          result.scanned === 0
            ? "No SMS found in the last 90 days."
            : result.paymentLike === 0
              ? `Scanned ${result.scanned} messages — none looked like bank/UPI payments.`
              : result.parsed > 0 && result.junked > 0
                ? `Found ${result.paymentLike} payment-like messages; ${result.junked} were parsed but none met the quality bar (merchant, confidence, or pending status). Try a screenshot import instead.`
                : `Found ${result.paymentLike} payment-like messages but could not parse amounts confidently. Try a screenshot import instead.`,
        );
        return;
      }

      // First successful SMS import → turn on live auto-import for next messages
      try {
        const already = await getSmsAutoImportEnabled();
        if (!already) await enableSmsAutoImport();
      } catch {
        /* permission edge — bulk import already finished */
      }

      setStatus(null);
      const parts = [
        result.created > 0 ? `Added ${result.created}` : null,
        result.skipped > 0
          ? `skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}`
          : null,
        result.failed > 0 ? `${result.failed} failed` : null,
        result.partial ? "stopped early (partial save)" : null,
      ].filter(Boolean);

      Alert.alert(
        result.partial
          ? "Import partially complete"
          : result.created > 0
            ? "Import complete"
            : "Nothing new added",
        parts.join(" · ") || "No changes",
        [{ text: "OK", onPress: () => router.replace("/(app)") }],
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read SMS on this device.",
      );
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const smsAvailable = Platform.OS === "android";

  // Home menu "SMS" opens Import with mode=sms and starts the scan once.
  useEffect(() => {
    if (params.mode !== "sms") return;
    if (autoSmsStarted.current) return;
    if (!smsAvailable || busy) return;
    autoSmsStarted.current = true;
    void scanSms();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount/mode
  }, [params.mode]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      {/* Tesseract.js host — enables OCR in Expo Go */}
      <TesseractHost />

      <AppHeader
        title="Import"
        subtitle="SMS · PhonePe & GPay · stays on device"
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 48,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {smsAvailable ? (
          <Card variant="soft" style={{ gap: spacing.md }}>
            <Text variant="label">SMS inbox</Text>
            <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
              Scan the last 90 days, then keep auto-importing new bank/UPI SMS
              as they arrive (while the app is unlocked). Nothing is uploaded.
            </Text>
            <Button
              title={
                busy
                  ? status?.startsWith("Found") ||
                    status?.startsWith("Importing")
                    ? "Importing…"
                    : "Scanning…"
                  : "Import from SMS"
              }
              loading={busy}
              onPress={scanSms}
              disabled={busy}
            />
          </Card>
        ) : null}

        <Card variant="soft" style={{ gap: spacing.md }}>
          <Text variant="label">Screenshot</Text>
          <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
            Pick PhonePe or GPay screenshots. Text is read on this device.
          </Text>

          {picked.length === 0 ? (
            <Button
              title="Choose from gallery"
              onPress={pickImage}
              disabled={busy}
            />
          ) : (
            <>
              <View style={styles.pillRow}>
                {picked.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.pillThumb}
                    />
                    <Text style={styles.pillLabel} numberOfLines={1}>
                      Shot {index + 1}
                    </Text>
                    <Pressable
                      onPress={() => removePicked(item.id)}
                      hitSlop={10}
                      disabled={busy}
                      style={({ pressed }) => ({
                        opacity: pressed || busy ? 0.5 : 1,
                        padding: 2,
                      })}
                      accessibilityLabel={`Remove screenshot ${index + 1}`}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  </View>
                ))}

                {picked.length < 8 ? (
                  <Pressable
                    onPress={pickImage}
                    disabled={busy}
                    accessibilityLabel="Add another picture"
                    style={({ pressed }) => [
                      styles.addCircle,
                      {
                        borderColor: colors.borderStrong,
                        backgroundColor: colors.bg,
                        opacity: pressed || busy ? 0.55 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="add"
                      size={22}
                      color={colors.accentStrong}
                    />
                  </Pressable>
                ) : null}
              </View>

              <Button
                title={
                  busy
                    ? "Reading…"
                    : picked.length > 1
                      ? "Read screenshots"
                      : "Read screenshot"
                }
                loading={busy}
                onPress={() => runOcr(picked)}
                disabled={busy}
              />
            </>
          )}
        </Card>

        {status ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text muted style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
              {status}
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text color={colors.warning} style={{ lineHeight: 21, fontSize: 14 }}>
            {error}
          </Text>
        ) : null}

        {/* Secondary: paste text (collapsed by default) */}
        {!showPaste ? (
          <Pressable
            onPress={() => setShowPaste(true)}
            style={({ pressed }) => [
              styles.secondaryLink,
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Ionicons
              name="clipboard-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontSansSemi,
                fontSize: 13,
              }}
            >
              Or paste transaction text
            </Text>
          </Pressable>
        ) : (
          <Card variant="soft" style={{ gap: spacing.md }}>
            <View style={styles.pasteHeader}>
              <Text variant="label">Paste text</Text>
              <Pressable
                onPress={() => setShowPaste(false)}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 13,
                    fontFamily: typography.fontSansSemi,
                  }}
                >
                  Hide
                </Text>
              </Pressable>
            </View>
            <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
              Copy text from PhonePe / GPay (or long-press → share → copy),
              paste here, then parse.
            </Text>
            <Input
              value={pasteText}
              onChangeText={setPasteText}
              placeholder="Paste PhonePe or GPay text…"
              multiline
              style={{
                height: 140,
                textAlignVertical: "top",
                paddingTop: 14,
                backgroundColor: colors.bg,
                borderWidth: 0,
              }}
            />
            <Button
              title="Parse & continue"
              disabled={!pasteText.trim() || busy}
              onPress={parsePaste}
            />
            <Button
              title="Load sample (PhonePe)"
              variant="secondary"
              onPress={() => setPasteText(SAMPLE_PHONEPE)}
            />
          </Card>
        )}

        <Pressable
          onPress={() => router.push("/(app)/add")}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          <Text
            style={{
              textAlign: "center",
              color: colors.accentStrong,
              fontFamily: typography.fontSansSemi,
              fontSize: 14,
            }}
          >
            Or enter manually →
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  pillThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  pillLabel: {
    fontFamily: typography.fontSansSemi,
    fontSize: 13,
    maxWidth: 88,
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  secondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.sm,
  },
  pasteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
