/**
 * Optional remote category inference via spentd-api.
 *
 * Sends merchant + SMS/OCR details to POST /categories/infer and returns a slug.
 * Never throws into call sites — timeouts and network errors yield null so
 * on-device rules remain the offline fallback.
 */
import type {
  CategorizeDirection,
  CategorySlug,
} from "@paymenttracker/shared";
import { isCategorySlug } from "@paymenttracker/shared";
import Constants from "expo-constants";
import { Platform } from "react-native";

export type RemoteCategorizeInput = {
  merchant: string;
  direction?: CategorizeDirection;
  rawText?: string | null;
  notes?: string | null;
  amount?: string | null;
  id?: string;
};

export type RemoteCategorizeResult = {
  slug: CategorySlug;
  confidence: "high" | "medium" | "low";
  source: string;
  reason?: string;
  id?: string | null;
};

const TIMEOUT_MS = 2500;
const BATCH_TIMEOUT_MS = 12_000;

let cachedBase: string | null | undefined;
let baseProbe: Promise<string | null> | null = null;

function envBase(): string | null {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_CATEGORIZE_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  const fromExtra = extra?.apiUrl?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");

  return null;
}

/** Emulator / local defaults only in __DEV__ when no env is set. */
function devCandidates(): string[] {
  if (!__DEV__) return [];
  if (Platform.OS === "android") {
    return [
      "http://10.0.2.2:3001", // Android emulator → host localhost
      "http://localhost:3001",
    ];
  }
  return ["http://localhost:3001"];
}

async function probe(base: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve API base once per session. Returns null when offline / unset.
 */
export async function getCategorizeApiBase(): Promise<string | null> {
  if (cachedBase !== undefined) return cachedBase;

  if (!baseProbe) {
    baseProbe = (async () => {
      const preferred = envBase();
      if (preferred) {
        // Always try configured URL first (prod or dev)
        if (await probe(preferred)) {
          cachedBase = preferred;
          return preferred;
        }
        // Still use it if probe failed — might be transient; requests will timeout
        cachedBase = preferred;
        return preferred;
      }

      for (const candidate of devCandidates()) {
        if (await probe(candidate)) {
          cachedBase = candidate;
          return candidate;
        }
      }

      cachedBase = null;
      return null;
    })();
  }

  return baseProbe;
}

/** Force re-detect (e.g. after user toggles server URL). */
export function resetCategorizeApiBase() {
  cachedBase = undefined;
  baseProbe = null;
}

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T | null> {
  const base = await getCategorizeApiBase();
  if (!base) return null;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseResult(
  data: {
    slug?: string;
    confidence?: string;
    source?: string;
    reason?: string;
    id?: string | null;
  } | null,
): RemoteCategorizeResult | null {
  if (!data?.slug || !isCategorySlug(data.slug)) return null;
  const confidence =
    data.confidence === "high" ||
    data.confidence === "medium" ||
    data.confidence === "low"
      ? data.confidence
      : "medium";
  return {
    slug: data.slug,
    confidence,
    source: data.source ?? "remote",
    reason: data.reason,
    id: data.id ?? null,
  };
}

/** Single payment → category slug from the server, or null if unavailable. */
export async function categorizeRemote(
  input: RemoteCategorizeInput,
): Promise<RemoteCategorizeResult | null> {
  const data = await postJson<{
    slug?: string;
    confidence?: string;
    source?: string;
    reason?: string;
    id?: string | null;
  }>(
    "/categories/infer",
    {
      merchant: input.merchant ?? "",
      direction: input.direction ?? "debit",
      rawText: input.rawText ?? null,
      notes: input.notes ?? null,
      amount: input.amount ?? null,
      id: input.id,
    },
    TIMEOUT_MS,
  );
  return parseResult(data);
}

/**
 * Batch categorize (SMS import). Returns a map of index → slug.
 * Falls back to empty map on failure so caller uses local rules.
 */
export async function categorizeRemoteBatch(
  items: RemoteCategorizeInput[],
): Promise<Map<number, CategorySlug>> {
  const out = new Map<number, CategorySlug>();
  if (!items.length) return out;

  // Chunk to stay under API max (200)
  const CHUNK = 100;
  for (let offset = 0; offset < items.length; offset += CHUNK) {
    const slice = items.slice(offset, offset + CHUNK);
    const data = await postJson<{
      results?: Array<{
        id?: string | null;
        slug?: string;
      }>;
    }>(
      "/categories/infer/batch",
      {
        items: slice.map((item, i) => ({
          id: item.id ?? String(offset + i),
          merchant: item.merchant ?? "",
          direction: item.direction ?? "debit",
          rawText: item.rawText ?? null,
          notes: item.notes ?? null,
          amount: item.amount ?? null,
        })),
      },
      BATCH_TIMEOUT_MS,
    );

    const results = data?.results;
    if (!results?.length) continue;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r?.slug || !isCategorySlug(r.slug)) continue;
      // Prefer id correlation, else positional
      const byId = r.id != null ? Number(r.id) : Number.NaN;
      const idx = Number.isFinite(byId) ? byId : offset + i;
      out.set(idx, r.slug);
    }
  }

  return out;
}
