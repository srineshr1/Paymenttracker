/**
 * Compatibility shim — the app is local-first now.
 * All data lives on device; this re-exports the local repository.
 * Backend HTTP client is intentionally unused (apps/api untouched for future sync).
 */
export {
  ApiError,
  api,
  configureApi,
  ensureApiReachable,
  getApiBase,
  LocalDataError,
  setApiBase,
} from "@/src/data/repository";
