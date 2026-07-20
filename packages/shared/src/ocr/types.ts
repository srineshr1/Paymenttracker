export type ParsedSource = "phonepe" | "gpay" | "sms" | "unknown";
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
  /**
   * Bank SMS often include post-txn available balance
   * (e.g. "Avl Bal Rs 10,000.00"). Used to mirror GPay/PhonePe account balance.
   */
  availableBalance?: string | null;
}

/** Raw SMS row from the device inbox (Android). */
export interface SmsMessageInput {
  body: string;
  /** Sender id / short code, e.g. VM-HDFCBK */
  address?: string | null;
  /** Epoch ms when the SMS was received */
  dateMs?: number | null;
}
