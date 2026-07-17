import type { Context, Next } from "hono";
import { verifyToken } from "../lib/auth.js";

export type AuthVariables = {
  userId: string;
  username: string;
};

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", payload.sub);
  c.set("username", payload.username);
  await next();
}
