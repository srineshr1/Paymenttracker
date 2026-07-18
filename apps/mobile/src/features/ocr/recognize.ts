import {
  parseUpiScreenshotAll,
  parseUpiScreenshotText,
  type ParsedExpense,
} from "@paymenttracker/shared";

/**
 * Read text from a screenshot (base64) on-device when a native OCR module is present.
 * No server call — parsers in @paymenttracker/shared are fully offline.
 */
export async function recognizeTextFromBase64(
  _imageBase64: string,
  _mimeType = "image/jpeg"
): Promise<{ text: string; engine: string }> {
  // ML Kit (and similar) require a custom dev client; Expo Go uses the stub.
  try {
    // Dynamic require so Metro can resolve the stub without hard-failing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mlkit = require("@react-native-ml-kit/text-recognition");
    const TextRecognition = mlkit?.default ?? mlkit;
    if (typeof TextRecognition?.recognize === "function") {
      // Real ML Kit needs a file URI; base64 path is not supported without writing a temp file.
      // Until wired with file URI in a dev client, fall through to the clear error.
    }
  } catch {
    /* package not installed */
  }

  throw new Error(
    "On-device OCR is not available in this build. Use Manual entry for now, or add a native OCR module in a custom build later. No server is required."
  );
}

export function parseScreenshotText(text: string): ParsedExpense {
  return parseUpiScreenshotText(text);
}

export function parseScreenshotAll(text: string): ParsedExpense[] {
  return parseUpiScreenshotAll(text);
}
