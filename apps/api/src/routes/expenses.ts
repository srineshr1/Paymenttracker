import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "@paymenttracker/shared";
import { and, desc, eq, gte, ilike, lt, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { categories, expenses } from "../db/schema.js";
import { serializeExpense } from "../lib/serialize.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

export const expenseRoutes = new Hono<{ Variables: AuthVariables }>();

expenseRoutes.use("*", requireAuth);

expenseRoutes.get("/", async (c) => {
  const query = listExpensesQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json(
      { error: "Invalid query", details: query.error.flatten() },
      400,
    );
  }

  const userId = c.get("userId");
  const { from, to, q, source, limit, offset } = query.data;

  const conditions = [eq(expenses.userId, userId)];
  if (from) conditions.push(gte(expenses.paidAt, new Date(from)));
  if (to) conditions.push(lte(expenses.paidAt, new Date(to)));
  if (source) conditions.push(eq(expenses.source, source));
  if (q) conditions.push(ilike(expenses.merchant, `%${q}%`));

  const rows = await db
    .select({
      expense: expenses,
      category: categories,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.paidAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    expenses: rows.map((r) => serializeExpense(r.expense, r.category)),
  });
});

expenseRoutes.get("/summary/month", async (c) => {
  const userId = c.get("userId");
  const now = new Date();
  const year = Number(c.req.query("year") ?? now.getUTCFullYear());
  const month = Number(c.req.query("month") ?? now.getUTCMonth() + 1);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return c.json({ error: "Invalid year or month" }, 400);
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [row] = await db
    .select({
      totalDebit: sql<string>`coalesce(sum(case when ${expenses.direction} = 'debit' then ${expenses.amount} else 0 end), 0)`,
      totalCredit: sql<string>`coalesce(sum(case when ${expenses.direction} = 'credit' then ${expenses.amount} else 0 end), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.paidAt, start),
        lt(expenses.paidAt, end),
      ),
    );

  return c.json({
    year,
    month,
    totalDebit: String(row?.totalDebit ?? "0"),
    totalCredit: String(row?.totalCredit ?? "0"),
    count: row?.count ?? 0,
  });
});

expenseRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [row] = await db
    .select({ expense: expenses, category: categories })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ expense: serializeExpense(row.expense, row.category) });
});

async function findSoftDuplicate(
  userId: string,
  merchant: string,
  amount: string,
  paidAt: Date,
) {
  const dayStart = new Date(paidAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(paidAt);
  dayEnd.setHours(23, 59, 59, 999);

  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.amount, amount),
        gte(expenses.paidAt, dayStart),
        lte(expenses.paidAt, dayEnd),
      ),
    )
    .limit(20);

  const norm = merchant.trim().toLowerCase();
  return rows.find((r) => r.merchant.trim().toLowerCase() === norm) ?? null;
}

expenseRoutes.post("/batch", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const items = Array.isArray(body?.expenses) ? body.expenses : null;
  if (!items || items.length === 0) {
    return c.json({ error: "Send { expenses: [...] }" }, 400);
  }
  if (items.length > 40) {
    return c.json({ error: "Max 40 expenses per batch" }, 400);
  }

  const created: unknown[] = [];
  const skipped: { index: number; reason: string; merchant?: string }[] = [];
  const failed: { index: number; reason: string }[] = [];

  // Dedupe within the batch itself
  const seenKeys = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const parsed = createExpenseSchema.safeParse(items[i]);
    if (!parsed.success) {
      failed.push({ index: i, reason: "Invalid fields" });
      continue;
    }
    const data = parsed.data;
    const upiRef = data.upiRef?.trim() || null;
    const paidAt = new Date(data.paidAt);
    const key = `${data.merchant.trim().toLowerCase()}|${data.amount}|${paidAt.toISOString().slice(0, 10)}`;

    if (seenKeys.has(key)) {
      skipped.push({
        index: i,
        reason: "Duplicate in this import",
        merchant: data.merchant,
      });
      continue;
    }
    seenKeys.add(key);

    if (upiRef) {
      const dup = await db.query.expenses.findFirst({
        where: and(eq(expenses.userId, userId), eq(expenses.upiRef, upiRef)),
      });
      if (dup) {
        skipped.push({
          index: i,
          reason: "UPI ref already saved",
          merchant: data.merchant,
        });
        continue;
      }
    }

    const soft = await findSoftDuplicate(
      userId,
      data.merchant,
      data.amount,
      paidAt,
    );
    if (soft) {
      skipped.push({
        index: i,
        reason: "Same merchant + amount already on this day",
        merchant: data.merchant,
      });
      continue;
    }

    try {
      const [row] = await db
        .insert(expenses)
        .values({
          userId,
          amount: data.amount,
          currency: data.currency ?? "INR",
          direction: data.direction ?? "debit",
          merchant: data.merchant,
          categoryId: data.categoryId ?? null,
          paidAt,
          source: data.source ?? "manual",
          upiRef,
          notes: data.notes ?? null,
          rawOcrText: data.rawOcrText ?? null,
        })
        .returning();
      if (row) created.push(serializeExpense(row, null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("expenses_user_upi_ref_idx")) {
        skipped.push({
          index: i,
          reason: "UPI ref already saved",
          merchant: data.merchant,
        });
      } else {
        failed.push({ index: i, reason: "Save failed" });
      }
    }
  }

  return c.json({
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    expenses: created,
    skippedItems: skipped,
    failedItems: failed,
  });
});

expenseRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const data = parsed.data;
  const upiRef = data.upiRef?.trim() || null;
  const paidAt = new Date(data.paidAt);

  if (upiRef) {
    const dup = await db.query.expenses.findFirst({
      where: and(eq(expenses.userId, userId), eq(expenses.upiRef, upiRef)),
    });
    if (dup) {
      return c.json(
        {
          error: "Duplicate transaction",
          message: "An expense with this UPI reference already exists.",
          existingId: dup.id,
        },
        409,
      );
    }
  }

  const soft = await findSoftDuplicate(
    userId,
    data.merchant,
    data.amount,
    paidAt,
  );
  if (soft) {
    return c.json(
      {
        error: "Duplicate transaction",
        message: "Same merchant and amount already exist on this day.",
        existingId: soft.id,
      },
      409,
    );
  }

  try {
    const [created] = await db
      .insert(expenses)
      .values({
        userId,
        amount: data.amount,
        currency: data.currency ?? "INR",
        direction: data.direction ?? "debit",
        merchant: data.merchant,
        categoryId: data.categoryId ?? null,
        paidAt,
        source: data.source ?? "manual",
        upiRef,
        notes: data.notes ?? null,
        rawOcrText: data.rawOcrText ?? null,
      })
      .returning();

    if (!created) return c.json({ error: "Failed to create" }, 500);

    let category = null;
    if (created.categoryId) {
      category =
        (await db.query.categories.findFirst({
          where: eq(categories.id, created.categoryId),
        })) ?? null;
    }

    return c.json({ expense: serializeExpense(created, category) }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("expenses_user_upi_ref_idx")) {
      return c.json({ error: "Duplicate transaction" }, 409);
    }
    throw err;
  }
});

expenseRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const existing = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, id), eq(expenses.userId, userId)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  const data = parsed.data;
  const updates: Partial<typeof expenses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.currency !== undefined) updates.currency = data.currency;
  if (data.direction !== undefined) updates.direction = data.direction;
  if (data.merchant !== undefined) updates.merchant = data.merchant;
  if (data.categoryId !== undefined) updates.categoryId = data.categoryId;
  if (data.paidAt !== undefined) updates.paidAt = new Date(data.paidAt);
  if (data.source !== undefined) updates.source = data.source;
  if (data.upiRef !== undefined) updates.upiRef = data.upiRef?.trim() || null;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.rawOcrText !== undefined) updates.rawOcrText = data.rawOcrText;

  const [updated] = await db
    .update(expenses)
    .set(updates)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);

  let category = null;
  if (updated.categoryId) {
    category =
      (await db.query.categories.findFirst({
        where: eq(categories.id, updated.categoryId),
      })) ?? null;
  }

  return c.json({ expense: serializeExpense(updated, category) });
});

expenseRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
