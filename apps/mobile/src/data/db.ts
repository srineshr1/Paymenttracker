import * as SQLite from "expo-sqlite";
import { randomUUID } from "expo-crypto";

const DB_NAME = "spentd_local.db";
const DATABASE_VERSION = 1;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const DEFAULT_CATEGORIES = [
  { name: "Food", slug: "food", icon: "utensils", color: "#E8A87C" },
  { name: "Travel", slug: "travel", icon: "car", color: "#85C1E9" },
  { name: "Shopping", slug: "shopping", icon: "bag", color: "#C39BD3" },
  { name: "Bills", slug: "bills", icon: "receipt", color: "#F5B041" },
  { name: "Transfer", slug: "transfer", icon: "arrows", color: "#7DCEA0" },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: "film",
    color: "#F1948A",
  },
  { name: "Health", slug: "health", icon: "heart", color: "#EC7063" },
  { name: "Other", slug: "other", icon: "tag", color: "#C4A574" },
] as const;

export type UserRow = {
  id: string;
  username: string;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
};

export type ExpenseRow = {
  id: string;
  user_id: string;
  amount_enc: string;
  currency: string;
  direction: string;
  merchant_enc: string;
  category_id: string | null;
  paid_at: string;
  source: string;
  upi_ref_hash: string | null;
  upi_ref_enc: string | null;
  notes_enc: string | null;
  raw_ocr_enc: string | null;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

function isDbDeadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("NullPointerException") ||
    msg.includes("prepareAsync") ||
    msg.includes("NativeDatabase") ||
    msg.includes("database is closed") ||
    msg.includes("Access to closed resource")
  );
}

async function migrate(db: SQLite.SQLiteDatabase) {
  // Avoid WAL on some Android/Expo Go builds (can leave a flaky native handle).
  await db.execAsync("PRAGMA journal_mode = DELETE;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  let version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
`);
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT 'tag',
  color TEXT NOT NULL DEFAULT '#C4A574'
);
`);
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  amount_enc TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  direction TEXT NOT NULL DEFAULT 'debit',
  merchant_enc TEXT NOT NULL,
  category_id TEXT,
  paid_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  upi_ref_hash TEXT,
  upi_ref_enc TEXT,
  notes_enc TEXT,
  raw_ocr_enc TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local'
);
`);
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS expenses_user_paid_at_idx ON expenses(user_id, paid_at);"
    );
    // Non-partial unique index — nulls allowed multiple times in SQLite UNIQUE
    await db.execAsync(
      "CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_upi_ref_hash_idx ON expenses(user_id, upi_ref_hash);"
    );
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    version = DATABASE_VERSION;
  }

  await seedCategories(db);
}

async function seedCategories(db: SQLite.SQLiteDatabase) {
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE slug = ?",
      [cat.slug]
    );
    if (existing) {
      await db.runAsync(
        "UPDATE categories SET name = ?, icon = ?, color = ? WHERE slug = ?",
        [cat.name, cat.icon, cat.color, cat.slug]
      );
    } else {
      await db.runAsync(
        "INSERT INTO categories (id, name, slug, icon, color) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), cat.name, cat.slug, cat.icon, cat.color]
      );
    }
  }
}

async function openFresh(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(db);
  // Sanity query so we fail fast if the native handle is bad
  await db.getFirstAsync("SELECT 1 AS ok");
  return db;
}

/**
 * Shared SQLite connection. Recovers from closed / NPE handles automatically.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    try {
      await dbInstance.getFirstAsync("SELECT 1 AS ok");
      return dbInstance;
    } catch (err) {
      if (isDbDeadError(err)) {
        await disposeDb();
      } else {
        throw err;
      }
    }
  }

  if (!openPromise) {
    openPromise = (async () => {
      try {
        const db = await openFresh();
        dbInstance = db;
        return db;
      } catch (err) {
        dbInstance = null;
        // One recovery attempt: delete corrupt file and recreate
        try {
          await SQLite.deleteDatabaseAsync(DB_NAME);
        } catch {
          /* ignore */
        }
        try {
          const db = await openFresh();
          dbInstance = db;
          return db;
        } catch (err2) {
          dbInstance = null;
          throw err2;
        }
      } finally {
        openPromise = null;
      }
    })();
  }

  return openPromise;
}

async function disposeDb() {
  const current = dbInstance;
  dbInstance = null;
  openPromise = null;
  if (current) {
    try {
      await current.closeAsync();
    } catch {
      /* already dead */
    }
  }
}

/** Close and drop the in-memory handle (next getDb re-opens). */
export async function resetDbHandle() {
  await disposeDb();
}

/** Wipe all app tables then reopen a clean DB. */
export async function wipeDatabaseTables() {
  const db = await getDb();
  try {
    await db.execAsync("DELETE FROM expenses;");
    await db.execAsync("DELETE FROM users;");
  } catch (err) {
    if (isDbDeadError(err)) {
      await disposeDb();
      try {
        await SQLite.deleteDatabaseAsync(DB_NAME);
      } catch {
        /* ignore */
      }
      await getDb();
      return;
    }
    throw err;
  }
}
