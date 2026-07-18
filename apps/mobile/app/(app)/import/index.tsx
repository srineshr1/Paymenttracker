import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Card, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing } from "@/src/design/tokens";
import {
  parseScreenshotAll,
  recognizeTextFromImage,
} from "@/src/features/ocr/recognize";

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
  uri: string;
  base64: string;
  mimeType: string;
};

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
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

  const pickImage = async () => {
    setError(null);
    setStatus(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Gallery permission is required to import screenshots.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      base64: asset.base64 ?? "",
      mimeType: asset.mimeType ?? "image/jpeg",
    });
    setError(null);
  };

  const parsePicked = async () => {
    if (!picked) {
      setError("Choose a screenshot first.");
      return;
    }

    setError(null);
    setBusy(true);
    setStatus("Reading text on device…");

    try {
      const { text } = await recognizeTextFromImage({
        uri: picked.uri,
        base64: picked.base64 || null,
        mimeType: picked.mimeType,
      });
      setStatus(null);
      goReview(picked.uri, text);
    } catch (e) {
      setStatus(null);
      if (e instanceof ApiError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Could not read this image. Try paste instead.");
      }
      setShowPaste(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="Import"
        subtitle="Local parse · nothing leaves this device"
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 40,
          gap: spacing.xl,
        }}
      >
        <Text muted>
          1) Choose a PhonePe or GPay screenshot{"\n"}
          2) Tap Parse (or paste OCR text){"\n"}
          3) Review fields, then save locally
        </Text>

        <Card variant="hero" style={styles.steps}>
          <Step n="01" title="Choose screenshot" body="From your gallery" />
          <Step n="02" title="Parse screenshot" body="We extract the text" />
          <Step n="03" title="Review & save" body="Confirm before anything saves" />
        </Card>

        <Button
          title={picked ? "Choose a different image" : "Choose from gallery"}
          variant={picked ? "secondary" : "primary"}
          onPress={pickImage}
          disabled={busy}
        />

        {picked ? (
          <>
            <Image
              source={{ uri: picked.uri }}
              style={[styles.preview, { backgroundColor: colors.bgCard }]}
              resizeMode="contain"
            />
            <Button
              title={busy ? "Parsing…" : "Parse screenshot"}
              loading={busy}
              onPress={parsePicked}
            />
          </>
        ) : null}

        {status ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.accent} />
            <Text muted style={{ flex: 1 }}>
              {status}
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text color={colors.warning} style={{ lineHeight: 22 }}>
            {error}
          </Text>
        ) : null}

        <Button
          title={showPaste ? "Hide paste option" : "Or paste text instead"}
          variant="link"
          onPress={() => setShowPaste((v) => !v)}
        />

        {showPaste ? (
          <Card variant="soft" style={{ gap: spacing.md }}>
            <Text variant="label">Screenshot text</Text>
            <Input
              value={pasteText}
              onChangeText={setPasteText}
              placeholder="Paste PhonePe or GPay transaction text…"
              multiline
              style={{ height: 140, textAlignVertical: "top", paddingTop: 14 }}
            />
            <Button
              title="Parse text"
              variant="secondary"
              disabled={!pasteText.trim()}
              onPress={() => {
                if (!pasteText.trim()) return;
                goReview(null, pasteText);
              }}
            />
            <Button
              title="Try sample (PhonePe)"
              variant="chip"
              onPress={() => setPasteText(SAMPLE_PHONEPE)}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepNum,
          { backgroundColor: colors.accentSoft, borderColor: colors.border },
        ]}
      >
        <Text
          style={{
            color: colors.accentStrong,
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          {n}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subtitle">{title}</Text>
        <Text muted>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: spacing.lg,
  },
  step: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  stepNum: {
    width: 40,
    height: 40,
    borderRadius: radius.sharp,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: radius.xl,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
});
