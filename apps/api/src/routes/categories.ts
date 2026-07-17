import { Hono } from "hono";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";
import { serializeCategory } from "../lib/serialize.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { asc } from "drizzle-orm";

export const categoryRoutes = new Hono<{ Variables: AuthVariables }>();

categoryRoutes.use("*", requireAuth);

categoryRoutes.get("/", async (c) => {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.name));
  return c.json({ categories: rows.map(serializeCategory) });
});
