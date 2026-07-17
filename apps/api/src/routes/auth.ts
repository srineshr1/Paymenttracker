import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { authBodySchema } from "@paymenttracker/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  hashPasscode,
  signToken,
  verifyPasscode,
} from "../lib/auth.js";
import { rateLimit } from "../lib/rate-limit.js";
import { serializeUser } from "../lib/serialize.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = authBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400
    );
  }

  const { username, passcode } = parsed.data;
  const ip = c.req.header("x-forwarded-for") ?? "local";
  const limited = rateLimit(`register:${ip}`, 10, 15 * 60_000);
  if (!limited.ok) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const passcodeHash = await hashPasscode(passcode);
  const [user] = await db
    .insert(users)
    .values({ username, passcodeHash })
    .returning();

  if (!user) {
    return c.json({ error: "Failed to create user" }, 500);
  }

  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, user: serializeUser(user) }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = authBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400
    );
  }

  const { username, passcode } = parsed.data;
  const ip = c.req.header("x-forwarded-for") ?? "local";
  const limited = rateLimit(`login:${username}:${ip}`, 5, 15 * 60_000);
  if (!limited.ok) {
    return c.json(
      {
        error: "Too many attempts. Try again later.",
        retryAfterMs: limited.retryAfterMs,
      },
      429
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  // Constant-ish path: always verify against a dummy hash if user missing
  const hash =
    user?.passcodeHash ??
    "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const ok = await verifyPasscode(hash, passcode);

  if (!user || !ok) {
    return c.json({ error: "Invalid username or passcode" }, 401);
  }

  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, user: serializeUser(user) });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ user: serializeUser(user) });
});
