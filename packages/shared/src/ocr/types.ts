export type ParsedSource = "phonepe" | "gpay" | "unknown";
export type ParsedDirection = "debit" | "credit";

export interface ParsedExpense {
  amount: string | null;
  currency: string;
  direction: ParsedDirection;
  merchant: string | null;
  paidAt: string | null;
  upiRef: string | null;
  source: ParsedSource;
  status: "success" | "failed" | "pending" | "unknown";
  confidence: number;
  rawText: string;
  warnings: string[];
}
