/**
 * Indian grouping with ASCII commas only.
 * Avoids toLocaleString("en-IN") separators that some mono fonts lack
 * (renders as broken "_" on Android/Hermes).
 *
 * 18676 → 18,676
 * 1234567 → 12,34,567
 */
function formatIndianGrouped(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  let rest = intDigits.slice(0, -3);
  const parts: string[] = [last3];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length) parts.unshift(rest);
  return parts.join(",");
}

export function formatINR(amount: string | number, opts?: { sign?: boolean }) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "₹—";

  const abs = Math.abs(n);
  const useFraction = Math.abs(abs % 1) > 1e-9;
  const fixed = abs.toFixed(useFraction ? 2 : 0);
  const [intPart, frac] = fixed.split(".");
  const grouped = formatIndianGrouped(intPart);
  const formatted = frac !== undefined && useFraction ? `${grouped}.${frac}` : grouped;
  const body = `₹${formatted}`;

  if (!opts?.sign) return body;
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

export function formatExpenseAmount(
  amount: string | number,
  direction: "debit" | "credit"
) {
  const body = formatINR(amount);
  return direction === "credit" ? `+${body}` : `−${body}`;
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Build with ASCII to avoid locale font holes
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${h}:${m} ${ampm}`;
}

export function formatMonthYear(year: number, month: number) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[month - 1]} ${year}`;
}

export function sourceLabel(source: string) {
  switch (source) {
    case "phonepe":
      return "PhonePe";
    case "gpay":
      return "GPay";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}
