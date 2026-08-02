import {
  type CategorizeDirection,
  type CategorySlug,
  categorizePayment,
  inferCategorySlug as inferCategorySlugShared,
} from "@paymenttracker/shared";
import {
  categorizeRemote,
  categorizeRemoteBatch,
} from "@/src/api/categorizeRemote";
import { getLearnedCategoryId } from "@/src/data/categoryLearning";
import { listCategories } from "@/src/data/expenses";

export type { CategorySlug };

export type ResolveCategoryOpts = {
  useLearned?: boolean;
  /** Skip network — local rules only (tests / offline bulk). */
  localOnly?: boolean;
  notes?: string | null;
  amount?: string | null;
};

/**
 * Infer a category slug from merchant name / SMS snippet (on-device rules).
 * Prefer `resolveCategoryId` which also hits the server when available.
 */
export function inferCategorySlug(
  merchant: string,
  direction: CategorizeDirection = "debit",
  rawText?: string | null,
): CategorySlug {
  return inferCategorySlugShared(merchant, direction, rawText);
}

let slugIdCache: Map<string, string> | null = null;

/** Clear after tests or category reseeds. */
export function clearCategorySlugCache() {
  slugIdCache = null;
}

export async function getCategoryIdBySlug(
  slug: CategorySlug | string,
): Promise<string | null> {
  if (!slugIdCache) {
    const { categories } = await listCategories();
    slugIdCache = new Map(categories.map((c) => [c.slug, c.id]));
  }
  return slugIdCache.get(slug) ?? slugIdCache.get("other") ?? null;
}

async function resolveSlug(
  merchant: string,
  direction: CategorizeDirection,
  rawText: string | null | undefined,
  opts?: ResolveCategoryOpts,
): Promise<CategorySlug> {
  if (!opts?.localOnly) {
    try {
      const remote = await categorizeRemote({
        merchant,
        direction,
        rawText,
        notes: opts?.notes,
        amount: opts?.amount,
      });
      if (remote?.slug) return remote.slug;
    } catch {
      /* offline / timeout → local */
    }
  }

  return categorizePayment({
    merchant,
    direction,
    rawText,
    notes: opts?.notes,
    amount: opts?.amount,
  }).slug;
}

/**
 * Resolve merchant (+ optional direction/raw) to a category UUID for insert.
 *
 * Precedence:
 * 1. Learned merchant→category (user corrections)
 * 2. spentd-api POST /categories/infer (when reachable)
 * 3. On-device rule engine (same logic as the server)
 */
export async function resolveCategoryId(
  merchant: string,
  direction: CategorizeDirection = "debit",
  rawText?: string | null,
  opts?: ResolveCategoryOpts,
): Promise<string | null> {
  if (opts?.useLearned !== false) {
    const learned = await getLearnedCategoryId(merchant);
    if (learned) return learned;
  }

  const slug = await resolveSlug(merchant, direction, rawText, opts);
  return getCategoryIdBySlug(slug);
}

/**
 * Batch resolve for SMS import — one network round-trip when the API is up.
 * `items[i]` maps to result array index i (null = unresolved).
 */
export async function resolveCategoryIdsBatch(
  items: Array<{
    merchant: string;
    direction?: CategorizeDirection;
    rawText?: string | null;
    amount?: string | null;
  }>,
  opts?: { useLearned?: boolean; localOnly?: boolean },
): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(items.length).fill(null);
  if (!items.length) return out;

  // Learned first
  if (opts?.useLearned !== false) {
    await Promise.all(
      items.map(async (item, i) => {
        const learned = await getLearnedCategoryId(item.merchant);
        if (learned) out[i] = learned;
      }),
    );
  }

  const needRemote: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (out[i] == null) needRemote.push(i);
  }

  if (needRemote.length && !opts?.localOnly) {
    try {
      const remoteMap = await categorizeRemoteBatch(
        needRemote.map((i) => ({
          merchant: items[i].merchant,
          direction: items[i].direction ?? "debit",
          rawText: items[i].rawText,
          amount: items[i].amount,
          id: String(i),
        })),
      );
      for (const i of needRemote) {
        const slug = remoteMap.get(i);
        if (slug) out[i] = await getCategoryIdBySlug(slug);
      }
    } catch {
      /* fall through to local */
    }
  }

  // Local rules for anything still missing
  await Promise.all(
    items.map(async (item, i) => {
      if (out[i] != null) return;
      const slug = categorizePayment({
        merchant: item.merchant,
        direction: item.direction ?? "debit",
        rawText: item.rawText,
        amount: item.amount,
      }).slug;
      out[i] = await getCategoryIdBySlug(slug);
    }),
  );

  return out;
}

/**
 * Category suggestion for editors (manual add / import review) — same
 * precedence as the import path: learned → server → local rules.
 */
export async function suggestCategoryId(
  merchant: string,
  direction: CategorizeDirection = "debit",
  rawText?: string | null,
): Promise<string | null> {
  return resolveCategoryId(merchant, direction, rawText);
}

/** Learned-only lookup (no rule fallback), for prefill hints. */
export async function learnedCategoryIdFor(
  merchant: string,
): Promise<string | null> {
  return getLearnedCategoryId(merchant);
}
