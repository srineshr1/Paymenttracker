import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Expense } from "@paymenttracker/shared";
import { listExpenses } from "./expenses";

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function buildExpensesCsv(expenses: Expense[]): Promise<string> {
  const header = [
    "id",
    "paidAt",
    "merchant",
    "amount",
    "currency",
    "direction",
    "source",
    "category",
    "upiRef",
    "notes",
  ].join(",");

  const rows = expenses.map((e) =>
    [
      e.id,
      e.paidAt,
      e.merchant,
      e.amount,
      e.currency,
      e.direction,
      e.source,
      e.category?.name ?? "",
      e.upiRef ?? "",
      e.notes ?? "",
    ]
      .map((c) => csvEscape(String(c)))
      .join(",")
  );

  return [header, ...rows].join("\n");
}

export async function exportExpensesShare(
  format: "csv" | "json" = "csv"
): Promise<{ count: number }> {
  const { expenses } = await listExpenses({ limit: 200 });
  // Pull more pages if needed (simple second fetch with higher limit already max 200)

  const stamp = new Date().toISOString().slice(0, 10);
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error("Cannot write export file on this device.");

  let path: string;
  let mimeType: string;
  if (format === "json") {
    path = `${dir}spentd-export-${stamp}.json`;
    await FileSystem.writeAsStringAsync(
      path,
      JSON.stringify({ exportedAt: new Date().toISOString(), expenses }, null, 2)
    );
    mimeType = "application/json";
  } else {
    path = `${dir}spentd-export-${stamp}.csv`;
    await FileSystem.writeAsStringAsync(path, await buildExpensesCsv(expenses));
    mimeType = "text/csv";
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(path, {
    mimeType,
    dialogTitle: "Export Spentd data",
    UTI: format === "json" ? "public.json" : "public.comma-separated-values-text",
  });

  return { count: expenses.length };
}
