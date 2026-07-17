import { Hono } from "hono";
import { createWorker } from "tesseract.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { rateLimit } from "../lib/rate-limit.js";

export const ocrRoutes = new Hono<{ Variables: AuthVariables }>();

ocrRoutes.use("*", requireAuth);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

async function runOcr(buffer: Buffer) {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(buffer);
    const text = (result.data.text ?? "").trim();
    return {
      text,
      confidence: result.data.confidence ?? null,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * POST /ocr
 * Accepts either:
 *  - JSON: { imageBase64: string, mimeType?: string }
 *  - multipart form field "image"
 */
ocrRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const limited = rateLimit(`ocr:${userId}`, 20, 15 * 60_000);
  if (!limited.ok) {
    return c.json({ error: "Too many OCR requests. Try again later." }, 429);
  }

  const contentType = c.req.header("content-type") ?? "";
  let buffer: Buffer | null = null;

  try {
    if (contentType.includes("application/json")) {
      const json = await c.req.json().catch(() => null) as {
        imageBase64?: string;
        mimeType?: string;
      } | null;

      const raw = json?.imageBase64?.trim();
      if (!raw) {
        return c.json(
          { error: "Missing imageBase64 in JSON body." },
          400
        );
      }

      // Strip data-URL prefix if present
      const b64 = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      buffer = Buffer.from(b64, "base64");
    } else {
      // multipart fallback
      const body = (await c.req.parseBody({ all: true })) as Record<
        string,
        unknown
      >;
      const file = body.image ?? body.file;
      if (!file) {
        return c.json(
          {
            error:
              "Send JSON { imageBase64 } or multipart field 'image'.",
          },
          400
        );
      }

      if (typeof File !== "undefined" && file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer());
      } else if (file && typeof file === "object" && "arrayBuffer" in file) {
        buffer = Buffer.from(await (file as Blob).arrayBuffer());
      } else {
        return c.json({ error: "Unsupported image payload" }, 400);
      }
    }
  } catch (err) {
    console.error("OCR body parse error:", err);
    return c.json({ error: "Could not read image payload" }, 400);
  }

  if (!buffer || buffer.length < 100) {
    return c.json({ error: "Image data is empty or too small" }, 400);
  }
  if (buffer.length > MAX_BYTES) {
    return c.json({ error: "Image too large (max 8MB)" }, 413);
  }

  try {
    const { text, confidence } = await runOcr(buffer);
    if (!text) {
      return c.json(
        {
          error: "No text found in image",
          text: "",
          engine: "tesseract",
        },
        422
      );
    }
    return c.json({
      text,
      engine: "tesseract",
      confidence,
    });
  } catch (err) {
    console.error("OCR failed:", err);
    return c.json(
      {
        error:
          "OCR failed. Try a clearer screenshot, or paste the text manually.",
      },
      500
    );
  }
});
