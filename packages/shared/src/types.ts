export type Direction = "debit" | "credit";
export type ExpenseSource = "phonepe" | "gpay" | "sms" | "manual" | "cash";

export interface UserPublic {
  id: string;
  username: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

export interface Expense {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  direction: Direction;
  merchant: string;
  categoryId: string | null;
  category?: Category | null;
  paidAt: string;
  source: ExpenseSource;
  upiRef: string | null;
  notes: string | null;
  rawOcrText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface MonthSummary {
  year: number;
  month: number;
  totalDebit: string;
  totalCredit: string;
  count: number;
}
