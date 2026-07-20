import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";
import { serializeCategory } from "../lib/serialize.js";
import { type AuthVariables, requireAuth } from "../middleware/auth.js";

export const categoryRoutes = new Hono<{ Variables: AuthVariables }>();

categoryRoutes.use("*", requireAuth);

categoryRoutes.get("/", async (c) => {
  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return c.json({ categories: rows.map(serializeCategory) });
});
