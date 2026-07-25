/**
 * App version + credit for Settings.
 * Values come from `version.gen.ts`, produced by `scripts/sync-version.mjs`
 * from the nearest git tag (run via prestart / CI — no manual bumps).
 */
export {
  APP_VERSION,
  APP_VERSION_CODE,
  AUTHOR,
  AUTHOR_URL,
} from "./version.gen";
