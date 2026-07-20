import type { Category, Expense, UserPublic } from "@paymenttracker/shared";
import type { CategoryRow, ExpenseRow, UserRow } from "../db/schema.js";

export function serializeUser(u: UserRow): UserPublic {
  return {
    id: u.id,
    username: u.username,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeCategory(c: CategoryRow): Category {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    color: c.color,
  };
}

export function serializeExpense(
  e: ExpenseRow,
  category?: CategoryRow | null,
): Expense {
  return {
    id: e.id,
    userId: e.userId,
    amount: String(e.amount),
    currency: e.currency,
    direction: e.direction,
    merchant: e.merchant,
    categoryId: e.categoryId,
    category: category ? serializeCategory(category) : null,
    paidAt: e.paidAt.toISOString(),
    source: e.source,
    upiRef: e.upiRef,
    notes: e.notes,
    rawOcrText: e.rawOcrText,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
