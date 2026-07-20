import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const directionEnum = pgEnum("direction", ["debit", "credit"]);
export const sourceEnum = pgEnum("source", [
  "phonepe",
  "gpay",
  "manual",
  "sms",
  "cash",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    passcodeHash: text("passcode_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("users_username_idx").on(t.username)],
);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon").notNull().default("tag"),
  color: text("color").notNull().default("#C4A574"),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    direction: directionEnum("direction").notNull().default("debit"),
    merchant: text("merchant").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    source: sourceEnum("source").notNull().default("manual"),
    upiRef: text("upi_ref"),
    notes: text("notes"),
    rawOcrText: text("raw_ocr_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("expenses_user_paid_at_idx").on(t.userId, t.paidAt),
    uniqueIndex("expenses_user_upi_ref_idx").on(t.userId, t.upiRef),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
