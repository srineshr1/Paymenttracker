import {
  type Category,
  createExpenseSchema,
  type Expense,
  type ExpenseSource,
  type MonthSummary,
} from "@paymenttracker/shared";
import { randomUUID } from "expo-crypto";
import {
  getStoredUserId,
  hashUpiRef,
  LocalDataError,
  openString,
  sealNullable,
  sealString,
} from "./crypto";
import { type CategoryRow, type ExpenseRow, getDb } from "./db";

async function requireUserId(): Promise<string> {
  const id = await getStoredUserId();
  if (!id) throw new LocalDataError("Not signed in", 401);
  return id;
}

function mapCategory(row: CategoryRow | null | undefined): Category | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
  };
}

async function decryptExpense(
  row: ExpenseRow,
  category: CategoryRow | null,
): Promise<Expense> {
  const [amount, merchant, notes, rawOcr, upiRef] = await Promise.all([
    openString(row.amount_enc),
    openString(row.merchant_enc),
    openString(row.notes_enc),
    openString(row.raw_ocr_enc),
    openString(row.upi_ref_enc),
  ]);

  return {
    id: row.id,
    userId: row.user_id,
    amount: amount ?? "0",
    currency: row.currency,
    direction: row.direction as Expense["direction"],
    merchant: merchant ?? "",
    categoryId: row.category_id,
    category: mapCategory(category),
    paidAt: row.paid_at,
    source: row.source as ExpenseSource,
    upiRef,
    notes,
    rawOcrText: rawOcr,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadCategory(id: string | null): Promise<CategoryRow | null> {
  if (!id) return null;
  const db = await getDb();
  return (
    (await db.getFirstAsync<CategoryRow>(
      "SELECT id, name, slug, icon, color FROM categories WHERE id = ?",
      id,
    )) ?? null
  );
}

function dayBounds(paidAt: Date): { start: string; end: string } {
  const y = paidAt.getFullYear();
  const m = String(paidAt.getMonth() + 1).padStart(2, "0");
  const d = String(paidAt.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${d}T00:00:00.000`,
    end: `${y}-${m}-${d}T23:59:59.999`,
  };
}

async function findSoftDuplicate(
  userId: string,
  merchant: string,
  amount: string,
  paidAt: Date,
): Promise<ExpenseRow | null> {
  const db = await getDb();
  const { start, end } = dayBounds(paidAt);
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
     WHERE user_id = ? AND paid_at >= ? AND paid_at <= ?
     LIMIT 40`,
    userId,
    start,
    end,
  );

  const norm = merchant.trim().toLowerCase();
  for (const row of rows) {
    const [m, a] = await Promise.all([
      openString(row.merchant_enc),
      openString(row.amount_enc),
    ]);
    if ((m ?? "").trim().toLowerCase() === norm && (a ?? "") === amount) {
      return row;
    }
  }
  return null;
}

export async function listExpenses(params?: {
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}): Promise<{ expenses: Expense[] }> {
  const userId = await requireUserId();
  const db = await getDb();
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);

  const clauses = ["e.user_id = ?"];
  const binds: (string | number)[] = [userId];

  if (params?.from) {
    clauses.push("e.paid_at >= ?");
    binds.push(params.from);
  }
  if (params?.to) {
    clauses.push("e.paid_at <= ?");
    binds.push(params.to);
  }

  binds.push(limit);

  const rows = await db.getAllAsync<
    ExpenseRow & {
      cat_id: string | null;
      cat_name: string | null;
      cat_slug: string | null;
      cat_icon: string | null;
      cat_color: string | null;
    }
  >(
    `SELECT e.*,
            c.id as cat_id, c.name as cat_name, c.slug as cat_slug,
            c.icon as cat_icon, c.color as cat_color
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.paid_at DESC
     LIMIT ?`,
    ...binds,
  );

  const q = params?.q?.trim().toLowerCase();
  const expenses: Expense[] = [];
  for (const row of rows) {
    const cat: CategoryRow | null =
      row.cat_id && row.cat_name
        ? {
            id: row.cat_id,
            name: row.cat_name,
            slug: row.cat_slug ?? "",
            icon: row.cat_icon ?? "tag",
            color: row.cat_color ?? "#C4A574",
          }
        : null;
    const exp = await decryptExpense(row, cat);
    if (q && !exp.merchant.toLowerCase().includes(q)) continue;
    expenses.push(exp);
  }

  return { expenses };
}

export async function monthSummary(
  year?: number,
  month?: number,
): Promise<MonthSummary> {
  const userId = await requireUserId();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new LocalDataError("Invalid year or month", 400);
  }

  const start = new Date(y, m - 1, 1).toISOString();
  const end = new Date(y, m, 1).toISOString();

  const db = await getDb();
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
     WHERE user_id = ? AND paid_at >= ? AND paid_at < ?`,
    userId,
    start,
    end,
  );

  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of rows) {
    const amountStr = await openString(row.amount_enc);
    const n = Number(amountStr ?? 0);
    if (!Number.isFinite(n)) continue;
    if (row.direction === "credit") totalCredit += n;
    else totalDebit += n;
  }

  return {
    year: y,
    month: m,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    count: rows.length,
  };
}

export async function getExpense(id: string): Promise<{ expense: Expense }> {
  const userId = await requireUserId();
  const db = await getDb();
  const row = await db.getFirstAsync<ExpenseRow>(
    "SELECT * FROM expenses WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!row) throw new LocalDataError("Not found", 404);
  const category = await loadCategory(row.category_id);
  return { expense: await decryptExpense(row, category) };
}

type CreateInput = Record<string, unknown>;

async function insertExpense(
  userId: string,
  data: ReturnType<typeof createExpenseSchema.parse>,
): Promise<Expense> {
  const upiRef = data.upiRef?.trim() || null;
  const paidAt = new Date(data.paidAt);
  const paidAtIso = paidAt.toISOString();
  const now = new Date().toISOString();
  const id = randomUUID();

  if (upiRef) {
    const refHash = await hashUpiRef(userId, upiRef);
    const db = await getDb();
    const dup = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM expenses WHERE user_id = ? AND upi_ref_hash = ?",
      userId,
      refHash,
    );
    if (dup) {
      throw new LocalDataError(
        "An expense with this UPI reference already exists.",
        409,
        { existingId: dup.id },
      );
    }
  }

  // Cash wallet logs can repeat the same amount many times in a day.
  if (data.source !== "cash") {
    const soft = await findSoftDuplicate(
      userId,
      data.merchant,
      data.amount,
      paidAt,
    );
    if (soft) {
      throw new LocalDataError(
        "Same merchant and amount already exist on this day.",
        409,
        { existingId: soft.id },
      );
    }
  }

  const [amountEnc, merchantEnc, notesEnc, rawEnc, upiEnc] = await Promise.all([
    sealString(data.amount),
    sealString(data.merchant),
    sealNullable(data.notes ?? null),
    sealNullable(data.rawOcrText ?? null),
    sealNullable(upiRef),
  ]);

  const upiHash = upiRef ? await hashUpiRef(userId, upiRef) : null;

  const db = await getDb();
  try {
    await db.runAsync(
      `INSERT INTO expenses (
        id, user_id, amount_enc, currency, direction, merchant_enc,
        category_id, paid_at, source, upi_ref_hash, upi_ref_enc,
        notes_enc, raw_ocr_enc, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
      id,
      userId,
      amountEnc,
      data.currency ?? "INR",
      data.direction ?? "debit",
      merchantEnc,
      data.categoryId ?? null,
      paidAtIso,
      data.source ?? "manual",
      upiHash,
      upiEnc,
      notesEnc,
      rawEnc,
      now,
      now,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("unique")) {
      throw new LocalDataError("Duplicate transaction", 409);
    }
    throw err;
  }

  const category = await loadCategory(data.categoryId ?? null);
  return {
    id,
    userId,
    amount: data.amount,
    currency: data.currency ?? "INR",
    direction: data.direction ?? "debit",
    merchant: data.merchant,
    categoryId: data.categoryId ?? null,
    category: mapCategory(category),
    paidAt: paidAtIso,
    source: data.source ?? "manual",
    upiRef,
    notes: data.notes ?? null,
    rawOcrText: data.rawOcrText ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createExpense(
  body: CreateInput,
): Promise<{ expense: Expense }> {
  const userId = await requireUserId();
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    throw new LocalDataError(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
    );
  }
  const expense = await insertExpense(userId, parsed.data);
  return { expense };
}

export async function createExpensesBatch(items: CreateInput[]): Promise<{
  created: number;
  skipped: number;
  failed: number;
  expenses: Expense[];
  skippedItems: { index: number; reason: string; merchant?: string }[];
  failedItems: { index: number; reason: string }[];
}> {
  const userId = await requireUserId();
  if (!items.length) {
    throw new LocalDataError("Send { expenses: [...] }", 400);
  }
  // Soft ceiling so a runaway payload cannot freeze the UI; SMS bulk import needs >> 40.
  if (items.length > 500) {
    throw new LocalDataError("Max 500 expenses per batch", 400);
  }

  const created: Expense[] = [];
  const skipped: { index: number; reason: string; merchant?: string }[] = [];
  const failed: { index: number; reason: string }[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const parsed = createExpenseSchema.safeParse(items[i]);
    if (!parsed.success) {
      failed.push({ index: i, reason: "Invalid fields" });
      continue;
    }
    const data = parsed.data;
    const paidAt = new Date(data.paidAt);
    const key = `${data.merchant.trim().toLowerCase()}|${data.amount}|${paidAt
      .toISOString()
      .slice(0, 10)}`;

    if (seenKeys.has(key)) {
      skipped.push({
        index: i,
        reason: "Duplicate in this import",
        merchant: data.merchant,
      });
      continue;
    }
    seenKeys.add(key);

    try {
      const expense = await insertExpense(userId, data);
      created.push(expense);
    } catch (e) {
      if (e instanceof LocalDataError && e.status === 409) {
        skipped.push({
          index: i,
          reason: e.message.includes("UPI")
            ? "UPI ref already saved"
            : "Same merchant + amount already on this day",
          merchant: data.merchant,
        });
      } else {
        failed.push({ index: i, reason: "Save failed" });
      }
    }
  }

  return {
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    expenses: created,
    skippedItems: skipped,
    failedItems: failed,
  };
}

export async function updateExpense(
  id: string,
  body: CreateInput,
): Promise<{ expense: Expense }> {
  const userId = await requireUserId();
  const db = await getDb();
  const existing = await db.getFirstAsync<ExpenseRow>(
    "SELECT * FROM expenses WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!existing) throw new LocalDataError("Not found", 404);

  const parsed = createExpenseSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new LocalDataError(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
    );
  }
  const data = parsed.data;
  const now = new Date().toISOString();

  let amountEnc = existing.amount_enc;
  let merchantEnc = existing.merchant_enc;
  let notesEnc = existing.notes_enc;
  let rawEnc = existing.raw_ocr_enc;
  let upiEnc = existing.upi_ref_enc;
  let upiHash = existing.upi_ref_hash;
  let currency = existing.currency;
  let direction = existing.direction;
  let categoryId = existing.category_id;
  let paidAt = existing.paid_at;
  let source = existing.source;

  if (data.amount !== undefined) amountEnc = await sealString(data.amount);
  if (data.merchant !== undefined)
    merchantEnc = await sealString(data.merchant);
  if (data.notes !== undefined) notesEnc = await sealNullable(data.notes);
  if (data.rawOcrText !== undefined)
    rawEnc = await sealNullable(data.rawOcrText);
  if (data.upiRef !== undefined) {
    const ref = data.upiRef?.trim() || null;
    upiEnc = await sealNullable(ref);
    upiHash = ref ? await hashUpiRef(userId, ref) : null;
  }
  if (data.currency !== undefined) currency = data.currency;
  if (data.direction !== undefined) direction = data.direction;
  if (data.categoryId !== undefined) categoryId = data.categoryId ?? null;
  if (data.paidAt !== undefined) paidAt = new Date(data.paidAt).toISOString();
  if (data.source !== undefined) source = data.source;

  await db.runAsync(
    `UPDATE expenses SET
      amount_enc = ?, currency = ?, direction = ?, merchant_enc = ?,
      category_id = ?, paid_at = ?, source = ?, upi_ref_hash = ?,
      upi_ref_enc = ?, notes_enc = ?, raw_ocr_enc = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    amountEnc,
    currency,
    direction,
    merchantEnc,
    categoryId,
    paidAt,
    source,
    upiHash,
    upiEnc,
    notesEnc,
    rawEnc,
    now,
    id,
    userId,
  );

  return getExpense(id);
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const db = await getDb();
  const result = await db.runAsync(
    "DELETE FROM expenses WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (result.changes === 0) throw new LocalDataError("Not found", 404);
  return { ok: true };
}

export async function listCategories(): Promise<{ categories: Category[] }> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    "SELECT id, name, slug, icon, color FROM categories ORDER BY name",
  );
  return {
    categories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      icon: r.icon,
      color: r.color,
    })),
  };
}

/**
 * Assign categories to expenses that still have category_id null,
 * using merchant (+ raw OCR) heuristics. Safe to call after SMS re-import.
 */
export async function backfillMissingCategories(): Promise<number> {
  const userId = await requireUserId();
  const db = await getDb();
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
     WHERE user_id = ? AND category_id IS NULL
     ORDER BY paid_at DESC
     LIMIT 2000`,
    userId,
  );
  if (!rows.length) return 0;

  // Lazy import avoids circular deps (categorize → listCategories → here)
  const { resolveCategoryId } = await import(
    "@/src/features/sms/categorize"
  );

  let updated = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const merchant = (await openString(row.merchant_enc)) ?? "";
    const raw = await openString(row.raw_ocr_enc);
    const direction =
      row.direction === "credit" ? ("credit" as const) : ("debit" as const);
    const categoryId = await resolveCategoryId(merchant, direction, raw);
    if (!categoryId) continue;
    await db.runAsync(
      `UPDATE expenses SET category_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND category_id IS NULL`,
      categoryId,
      now,
      row.id,
      userId,
    );
    updated += 1;
  }
  return updated;
}
