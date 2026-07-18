import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username may only contain letters, numbers, and underscores"
  )
  .transform((v) => v.toLowerCase());

/** 6-digit numeric passcode — never stored client-side */
export const passcodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Passcode must be exactly 6 digits");

export const authBodySchema = z.object({
  username: usernameSchema,
  passcode: passcodeSchema,
});

export const changePasscodeSchema = z
  .object({
    currentPasscode: passcodeSchema,
    newPasscode: passcodeSchema,
  })
  .refine((d) => d.currentPasscode !== d.newPasscode, {
    message: "New passcode must be different",
    path: ["newPasscode"],
  });

export const updateUsernameSchema = z.object({
  username: usernameSchema,
  passcode: passcodeSchema,
});

export const directionSchema = z.enum(["debit", "credit"]);
export const sourceSchema = z.enum(["phonepe", "gpay", "sms", "manual"]);

export const createExpenseSchema = z.object({
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v.toFixed(2) : v))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, "Invalid amount")
        .refine((v) => Number(v) > 0, "Amount must be greater than zero")
    ),
  currency: z.string().default("INR"),
  direction: directionSchema.default("debit"),
  merchant: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().nullable().optional(),
  paidAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  source: sourceSchema.default("manual"),
  upiRef: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  rawOcrText: z.string().max(20000).nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  source: sourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuthBody = z.infer<typeof authBodySchema>;
export type ChangePasscodeInput = z.infer<typeof changePasscodeSchema>;
export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
