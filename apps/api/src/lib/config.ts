import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://paymenttracker:paymenttracker@localhost:5432/paymenttracker"
  ),
  jwtSecret: required(
    "JWT_SECRET",
    "dev-only-jwt-secret-change-in-production-please"
  ),
  jwtExpiresIn: "30m",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
