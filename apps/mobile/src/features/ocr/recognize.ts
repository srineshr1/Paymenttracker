import {
  parseUpiScreenshotAll,
  parseUpiScreenshotText,
  type ParsedExpense,
} from "@paymenttracker/shared";
import * as FileSystem from "expo-file-system/legacy";

export type RecognizeInput = {
  /** Preferred — file:// or content:// URI from image picker */
  uri?: string | null;
  /** Fallback when only base64 is available */
  base64?: string | null;
  mimeType?: string;
};

/**
 * On-device OCR via ML Kit (requires a custom dev build, not Expo Go).
 * Parsers in @paymenttracker/shared stay fully offline.
 */
export async function recognizeTextFromImage(
  input: RecognizeInput
): Promise<{ text: string; engine: string }> {
  let imageUri = input.uri?.trim() || null;

  if (!imageUri && input.base64) {
    const ext = input.mimeType?.includes("png") ? "png" : "jpg";
    const dir = FileSystem.cacheDirectory;
    if (!dir) {
      throw new Error("Could not access cache to process this image.");
    }
    imageUri = `${dir}spentd-ocr-${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(imageUri, input.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (!imageUri) {
    throw new Error("No image to read. Choose a screenshot or paste text.");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-ml-kit/text-recognition");
    const TextRecognition = mod?.default ?? mod;
    if (typeof TextRecognition?.recognize !== "function") {
      throw new Error("ML_KIT_UNAVAILABLE");
    }

    const script =
      TextRecognition.TextRecognitionScript?.LATIN ??
      mod?.TextRecognitionScript?.LATIN ??
      "Latin";

    const result = await TextRecognition.recognize(imageUri, script);
    const text =
      typeof result === "string"
        ? result
        : typeof result?.text === "string"
          ? result.text
          : "";

    if (!text.trim()) {
      throw new Error(
        "No text found in this image. Try a clearer screenshot or paste text."
      );
    }
    return { text, engine: "mlkit" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("ML_KIT") ||
      msg.includes("doesn't seem to be linked") ||
      msg.includes("Expo managed") ||
      msg.includes("Native module")
    ) {
      throw new Error(
        "On-device OCR needs the Spentd dev build (not Expo Go). Use Paste text below, or run: npx expo run:android"
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** @deprecated Prefer recognizeTextFromImage({ base64, mimeType }) */
export async function recognizeTextFromBase64(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<{ text: string; engine: string }> {
  return recognizeTextFromImage({ base64: imageBase64, mimeType });
}

export function parseScreenshotText(text: string): ParsedExpense {
  return parseUpiScreenshotText(text);
}

export function parseScreenshotAll(text: string): ParsedExpense[] {
  return parseUpiScreenshotAll(text);
}
