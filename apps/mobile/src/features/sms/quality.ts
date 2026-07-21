/**
 * SMS / import quality gate. The logic lives in @paymenttracker/shared (where
 * it is unit-tested); this module re-exports it so existing imports keep
 * working.
 */

export type { IsJunkOptions } from "@paymenttracker/shared";
export {
  dayKey,
  isJunk,
  isJunkForAutoImport,
  MIN_AUTO_IMPORT_CONFIDENCE,
  MIN_REVIEW_CONFIDENCE,
  resolveMerchant,
  safePaidAtIso,
} from "@paymenttracker/shared";
