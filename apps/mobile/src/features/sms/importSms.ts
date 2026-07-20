import {
  isPaymentSms,
  type ParsedExpense,
  parseSmsMessages,
  type SmsMessageInput,
} from "@paymenttracker/shared";
import { type ListInboxOptions, listInboxSms } from "./readInbox";

export type ImportSmsResult = {
  parsed: ParsedExpense[];
  scanned: number;
  paymentLike: number;
};

/**
 * Read the Android SMS inbox on-device and parse payment-like messages.
 * Nothing is uploaded — only structured expenses are returned for review.
 */
export async function importPaymentsFromSms(
  options: ListInboxOptions = {},
): Promise<ImportSmsResult> {
  const messages: SmsMessageInput[] = await listInboxSms(options);
  const paymentLike = messages.filter((m) =>
    isPaymentSms(m.body, m.address),
  ).length;
  const parsed = parseSmsMessages(messages, {
    minConfidence: 0.35,
    filterNonPayment: true,
  });

  // Cap for navigation payload + review UI (newest already first)
  const maxResults = 120;

  return {
    parsed: parsed.slice(0, maxResults),
    scanned: messages.length,
    paymentLike,
  };
}
