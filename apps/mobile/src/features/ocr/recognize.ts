import { NativeModules, Platform } from "react-native";
import {
  parseUpiScreenshotAll,
  parseUpiScreenshotText,
  type ParsedExpense,
} from "@paymenttracker/shared";
import * as FileSystem from "expo-file-system/legacy";
import { recognizeWithTesseract } from "./TesseractHost";

export type RecognizeInput = {
  /** Preferred — file:// or content:// URI from image picker */
  uri?: string | null;
  /** Fallback when only base64 is available */
  base64?: string | null;
  mimeType?: string;
};

/** True when ML Kit native module is linked (Spentd app build, not Expo Go). */
export function isMlKitAvailable(): boolean {
  try {
    return Boolean(NativeModules.TextRecognition);
  } catch {
    return false;
  }
}

/**
 * OCR is always available: ML Kit in a native build, Tesseract.js
 * (via hidden WebView) as Expo Go / fallback path.
 */
export function isOnDeviceOcrAvailable(): boolean {
  return true;
}

export function isFastOcrAvailable(): boolean {
  return isMlKitAvailable();
}

/**
 * ML Kit needs a real filesystem path. Gallery picks often return
 * content:// (Android) or ph:// (iOS) which can fail recognition.
 */
async function resolveLocalImageFile(
  input: RecognizeInput
): Promise<string> {
  const mime = input.mimeType ?? "image/jpeg";
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpg";
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error("Could not access cache to process this image.");
  }
  const dest = `${dir}spentd-ocr-${Date.now()}.${ext}`;

  const uri = input.uri?.trim() || null;

  // Prefer base64 write — always a clean file:// path
  if (input.base64?.trim()) {
    await FileSystem.writeAsStringAsync(dest, input.base64.trim(), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return dest;
  }

  if (!uri) {
    throw new Error("No image to read. Choose a screenshot or paste text.");
  }

  // Already a local file path
  if (
    uri.startsWith("file://") ||
    (Platform.OS === "android" && uri.startsWith("/"))
  ) {
    const normalized = uri.startsWith("file://") ? uri : `file://${uri}`;
    try {
      await FileSystem.copyAsync({ from: normalized, to: dest });
      return dest;
    } catch {
      return normalized;
    }
  }

  // content://, ph://, assets-library://, etc.
  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    throw new Error(
      "Could not open this image for reading. Try another screenshot or paste the text."
    );
  }
}

async function ensureBase64(input: RecognizeInput): Promise<{
  base64: string;
  mimeType: string;
}> {
  const mimeType = input.mimeType ?? "image/jpeg";
  if (input.base64?.trim()) {
    return {
      base64: input.base64
        .trim()
        .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ""),
      mimeType,
    };
  }

  const fileUri = await resolveLocalImageFile(input);
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mimeType };
}

async function recognizeWithMlKit(
  input: RecognizeInput
): Promise<{ text: string; engine: string }> {
  const imageUri = await resolveLocalImageFile(input);

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
}

/**
 * On-device OCR: ML Kit when linked, otherwise Tesseract.js in a WebView
 * (works in Expo Go). Parsing stays fully offline via @paymenttracker/shared.
 */
export async function recognizeTextFromImage(
  input: RecognizeInput
): Promise<{ text: string; engine: string }> {
  if (isMlKitAvailable()) {
    try {
      return await recognizeWithMlKit(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Fall through to Tesseract unless it's a "no text" result
      if (msg.includes("No text found")) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  try {
    const { base64, mimeType } = await ensureBase64(input);
    const text = await recognizeWithTesseract(base64, mimeType);
    if (!text.trim()) {
      throw new Error(
        "No text found in this image. Try a clearer screenshot or paste text."
      );
    }
    return { text, engine: "tesseract" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("No text found") || msg.includes("timed out")) {
      throw e instanceof Error ? e : new Error(msg);
    }
    throw new Error(
      e instanceof Error
        ? e.message
        : "Could not read this image. Try again or paste the text."
    );
  }
}

/** @deprecated Prefer recognizeTextFromImage */
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
