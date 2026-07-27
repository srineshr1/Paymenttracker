/**
 * Compatibility shim — the app is local-first.
 * All data lives on device; this re-exports the local repository.
 * Optional cloud API (if ever wired) lives outside this repo at spentd-api.
 */

export type {
  CreateExpenseOptions,
  ExpenseListParams,
} from "@/src/data/repository";
export {
  ApiError,
  api,
  configureApi,
  ensureApiReachable,
  getApiBase,
  LocalDataError,
  setApiBase,
} from "@/src/data/repository";
