/**
 * Merchant → category learning (on-device only).
 *
 * When the user corrects an expense's category we remember it for that
 * merchant, so later SMS / screenshot / manual entries for the same merchant
 * are categorized the way the user expects. Learned mappings win over the
 * rule-based heuristics in `features/sms/categorize`; rules stay as fallback.
 *
 * Privacy: the merchant name is stored as a user-salted SHA-256 hash for
 * lookups plus an AES-sealed copy for display. No plaintext merchant on disk.
 */
import {
  isLearnableMerchantKey,
  normalizeMerchantKey,
} from "@paymenttracker/shared";
import * as Crypto from "expo-crypto";
import {
  getStoredUserId,
  isUnlocked,
  LocalDataError,
  openString,
  sealString,
} from "./crypto";
import { getDb, type MerchantCategoryRow } from "./db";

export { normalizeMerchantKey };

export type LearnedMerchantCategory = {
  merchant: string;
  categoryId: string;
  hits: number;
  updatedAt: string;
};

/** merchantHash → categoryId (null = known-missing). Cleared on writes. */
let lookupCache: Map<string, string | null> | null = null;
let cacheUserId: string | null = null;

function cacheGet(userId: string, hash: string): string | null | undefined {
  if (cacheUserId !== userId) return undefined;
  return lookupCache?.get(hash);
}

function cacheSet(userId: string, hash: string, categoryId: string | null) {
  if (cacheUserId !== userId) {
    lookupCache = new Map();
    cacheUserId = userId;
  }
  lookupCache?.set(hash, categoryId);
}

/** Call after category reseeds, imports that change mappings, or logout. */
export function clearMerchantCategoryCache() {
  lookupCache = null;
  cacheUserId = null;
}

async function hashMerchant(userId: string, key: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${userId}|merchant-category|${key}`,
  );
}

async function currentUserId(): Promise<string | null> {
  try {
    return await getStoredUserId();
  } catch {
    return null;
  }
}

/**
 * Remember `merchant → categoryId`. Passing a null categoryId forgets the
 * mapping (the user explicitly cleared the category).
 * Best-effort: never throws into the caller's save path.
 */
export async function learnMerchantCategory(
  merchant: string | null | undefined,
  categoryId: string | null,
): Promise<boolean> {
  const key = normalizeMerchantKey(merchant);
  if (!isLearnableMerchantKey(key)) return false;

  const userId = await currentUserId();
  if (!userId) return false;

  try {
    const db = await getDb();
    const hash = await hashMerchant(userId, key);

    if (!categoryId) {
      await db.runAsync(
        "DELETE FROM merchant_categories WHERE user_id = ? AND merchant_hash = ?",
        userId,
        hash,
      );
      cacheSet(userId, hash, null);
      return true;
    }

    if (!isUnlocked()) return false;
    const now = new Date().toISOString();
    const merchantEnc = await sealString(key);
    await db.runAsync(
      `INSERT INTO merchant_categories
         (user_id, merchant_hash, merchant_enc, category_id, hits, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(user_id, merchant_hash) DO UPDATE SET
         category_id = excluded.category_id,
         merchant_enc = excluded.merchant_enc,
         hits = merchant_categories.hits + 1,
         updated_at = excluded.updated_at`,
      userId,
      hash,
      merchantEnc,
      categoryId,
      now,
      now,
    );
    cacheSet(userId, hash, categoryId);
    return true;
  } catch (err) {
    if (err instanceof LocalDataError) return false;
    return false;
  }
}

/**
 * Learned category for a merchant, or null when nothing was learned.
 * Stale mappings (category deleted / reseeded) resolve to null.
 */
export async function getLearnedCategoryId(
  merchant: string | null | undefined,
): Promise<string | null> {
  const key = normalizeMerchantKey(merchant);
  if (!isLearnableMerchantKey(key)) return null;

  const userId = await currentUserId();
  if (!userId) return null;

  try {
    const db = await getDb();
    const hash = await hashMerchant(userId, key);

    const cached = cacheGet(userId, hash);
    if (cached !== undefined) return cached;

    const row = await db.getFirstAsync<{ category_id: string }>(
      `SELECT mc.category_id
         FROM merchant_categories mc
         JOIN categories c ON c.id = mc.category_id
        WHERE mc.user_id = ? AND mc.merchant_hash = ?`,
      userId,
      hash,
    );
    const categoryId = row?.category_id ?? null;
    cacheSet(userId, hash, categoryId);
    return categoryId;
  } catch {
    return null;
  }
}

/** All learned mappings, newest first (Settings / debugging). */
export async function listLearnedMerchantCategories(
  limit = 200,
): Promise<LearnedMerchantCategory[]> {
  const userId = await currentUserId();
  if (!userId || !isUnlocked()) return [];

  const db = await getDb();
  const rows = await db.getAllAsync<MerchantCategoryRow>(
    `SELECT * FROM merchant_categories
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?`,
    userId,
    Math.min(Math.max(limit, 1), 1000),
  );

  const out: LearnedMerchantCategory[] = [];
  for (const row of rows) {
    let merchant = "";
    try {
      merchant = (await openString(row.merchant_enc)) ?? "";
    } catch {
      continue;
    }
    out.push({
      merchant,
      categoryId: row.category_id,
      hits: row.hits,
      updatedAt: row.updated_at,
    });
  }
  return out;
}

/** Forget every learned mapping for this device user. */
export async function clearLearnedMerchantCategories(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  const db = await getDb();
  const res = await db.runAsync(
    "DELETE FROM merchant_categories WHERE user_id = ?",
    userId,
  );
  clearMerchantCategoryCache();
  return res.changes ?? 0;
}
