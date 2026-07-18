import {
  parseUpiScreenshotAll,
  parseUpiScreenshotText,
  type ParsedExpense,
} from "@paymenttracker/shared";
import { api } from "@/src/api/client";

/**
 * Read text from a screenshot (base64) via the API (Tesseract).
 */
export async function recognizeTextFromBase64(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<{ text: string; engine: string }> {
  const res = await api.ocrImageBase64(imageBase64, mimeType);
  if (!res.text?.trim()) {
    throw new Error("No text found in this image. Try a clearer screenshot.");
  }
  return { text: res.text, engine: res.engine };
}

export function parseScreenshotText(text: string): ParsedExpense {
  return parseUpiScreenshotText(text);
}

export function parseScreenshotAll(text: string): ParsedExpense[] {
  return parseUpiScreenshotAll(text);
}
