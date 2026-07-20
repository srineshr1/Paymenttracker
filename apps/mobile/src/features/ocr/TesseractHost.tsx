import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

type Pending = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

type RecognizeFn = (base64: string, mimeType: string) => Promise<string>;

let recognizeImpl: RecognizeFn | null = null;
let readyResolve: (() => void) | null = null;
let readyPromise: Promise<void> | null = null;
let isReady = false;

function ensureReadyPromise() {
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      if (isReady) resolve();
      else readyResolve = resolve;
    });
  }
  return readyPromise;
}

/**
 * Call from JS after TesseractHost is mounted.
 * Falls back with a clear error if the host isn't in the tree yet.
 */
export async function recognizeWithTesseract(
  base64: string,
  mimeType = "image/jpeg",
): Promise<string> {
  await Promise.race([
    ensureReadyPromise(),
    new Promise<void>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "OCR engine is still starting. Check your network and try again.",
            ),
          ),
        25_000,
      ),
    ),
  ]);
  if (!recognizeImpl) {
    throw new Error("OCR engine is still starting. Try again in a moment.");
  }
  const clean = base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  return recognizeImpl(clean, mimeType);
}

export function isTesseractHostReady(): boolean {
  return isReady && Boolean(recognizeImpl);
}

/**
 * Hidden WebView that runs tesseract.js (works in Expo Go).
 * Mount once near the import screen root.
 */
export function TesseractHost() {
  const webRef = useRef<WebView>(null);
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  const seqRef = useRef(0);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let payload: {
      type?: string;
      id?: string;
      text?: string;
      error?: string;
    };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload.type === "ready") {
      isReady = true;
      readyResolve?.();
      readyResolve = null;
      return;
    }

    if (!payload.id) return;
    const pending = pendingRef.current.get(payload.id);
    if (!pending) return;
    pendingRef.current.delete(payload.id);

    if (payload.type === "result" && typeof payload.text === "string") {
      pending.resolve(payload.text);
      return;
    }
    pending.reject(
      new Error(payload.error || "Could not read text from this image."),
    );
  }, []);

  useEffect(() => {
    recognizeImpl = (base64, mimeType) =>
      new Promise<string>((resolve, reject) => {
        const id = `ocr-${++seqRef.current}`;

        const timeout = setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id);
            reject(
              new Error(
                "Screenshot reading timed out. Try a clearer image or paste the text.",
              ),
            );
          }
        }, 90_000);

        pendingRef.current.set(id, {
          resolve: (text: string) => {
            clearTimeout(timeout);
            resolve(text);
          },
          reject: (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          },
        });

        const js = `
          (function() {
            try {
              if (typeof window.__spentdOcr !== 'function') {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  id: ${JSON.stringify(id)},
                  error: 'OCR engine not ready'
                }));
                return true;
              }
              window.__spentdOcr(${JSON.stringify(id)}, ${JSON.stringify(base64)}, ${JSON.stringify(mimeType)});
            } catch (e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                id: ${JSON.stringify(id)},
                error: String(e && e.message ? e.message : e)
              }));
            }
            return true;
          })();
          true;
        `;
        webRef.current?.injectJavaScript(js);
      });

    ensureReadyPromise();

    return () => {
      recognizeImpl = null;
      isReady = false;
      readyPromise = null;
      readyResolve = null;
      for (const [, p] of pendingRef.current) {
        p.reject(new Error("OCR host unmounted."));
      }
      pendingRef.current.clear();
    };
  }, []);

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: TESSERACT_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        style={styles.web}
      />
    </View>
  );
}

const TESSERACT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
<script>
  (function () {
    var workerPromise = null;
    var readyPosted = false;

    function post(msg) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } catch (e) {}
    }

    function markReady() {
      if (readyPosted) return;
      readyPosted = true;
      post({ type: 'ready' });
    }

    function getWorker() {
      if (typeof Tesseract === 'undefined') {
        return Promise.reject(new Error('OCR library failed to load (need network once)'));
      }
      if (!workerPromise) {
        workerPromise = Tesseract.createWorker('eng', 1, {
          logger: function () {}
        });
      }
      return workerPromise;
    }

    window.__spentdOcr = async function (id, base64, mimeType) {
      try {
        var worker = await getWorker();
        var dataUrl = 'data:' + (mimeType || 'image/jpeg') + ';base64,' + base64;
        var result = await worker.recognize(dataUrl);
        var text = (result && result.data && result.data.text) ? result.data.text : '';
        post({ type: 'result', id: id, text: text || '' });
      } catch (e) {
        post({
          type: 'error',
          id: id,
          error: String(e && e.message ? e.message : e)
        });
      }
    };

    function boot() {
      if (typeof Tesseract === 'undefined') {
        markReady();
        return;
      }
      getWorker().then(markReady).catch(markReady);
    }

    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = boot;
    s.onerror = function () { markReady(); };
    document.head.appendChild(s);

    // Safety: never block the app forever if CDN hangs
    setTimeout(markReady, 20000);
  })();
</script>
</body>
</html>`;

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
    left: 0,
    top: 0,
  },
  web: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
