/**
 * Compatibility shim — the app is local-first now.
 * All data lives on device; this re-exports the local repository.
 * Backend HTTP client is intentionally unused (apps/api untouched for future sync).
 */
export {
  api,
  ApiError,
  configureApi,
  ensureApiReachable,
  getApiBase,
  setApiBase,
  LocalDataError,
} from "@/src/data/repository";
