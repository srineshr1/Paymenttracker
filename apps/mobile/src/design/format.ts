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

export function formatMonthShort(year: number, month: number) {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return `${months[month - 1]} ${year}`;
}

/** ₹42.8k · ₹1.2L · ₹42,850 */
export function formatINRCompact(amount: string | number) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "₹—";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) {
    const v = abs / 1_00_00_000;
    return `₹${v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")}Cr`;
  }
  if (abs >= 1_00_000) {
    const v = abs / 1_00_000;
    return `₹${v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    return `₹${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return formatINR(abs);
}

export function formatRelativePaidAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000
  );

  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const time = `${h}:${m} ${ampm}`;

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

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
  if (d.getFullYear() === now.getFullYear()) {
    return `${months[d.getMonth()]} ${d.getDate()}, ${time}`;
  }
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
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
