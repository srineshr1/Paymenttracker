import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./lib/config.js";
import { authRoutes } from "./routes/auth.js";
import { expenseRoutes } from "./routes/expenses.js";
import { categoryRoutes } from "./routes/categories.js";
import { ocrRoutes } from "./routes/ocr.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => c.json({ ok: true, service: "paymenttracker-api" }));

app.route("/auth", authRoutes);
app.route("/expenses", expenseRoutes);
app.route("/categories", categoryRoutes);
app.route("/ocr", ocrRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

console.log(`API listening on http://0.0.0.0:${config.port}`);
serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" });
