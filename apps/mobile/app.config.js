/**
 * Dynamic Expo config.
 *
 * App version is resolved from the nearest git tag (`v1.2.1` → `1.2.1`) so you
 * never need to hand-edit the Settings footer or app.json for releases.
 *
 * Override order:
 *   1. SPENTD_VERSION env
 *   2. GitHub tag ref (GITHUB_REF_NAME when building a v* tag)
 *   3. `git describe --tags --match "v*"`
 *   4. static app.json version (fallback)
 */
// biome-ignore lint/style/useNodejsImportProtocol: Expo config runs in CommonJS
const { execSync } = require("child_process");

/**
 * @returns {string | null}
 */
function resolveGitVersion() {
  const fromEnv = process.env.SPENTD_VERSION?.trim();
  if (fromEnv) return fromEnv.replace(/^v/i, "");

  const refName = process.env.GITHUB_REF_NAME?.trim();
  if (
    refName &&
    (process.env.GITHUB_REF_TYPE === "tag" || /^v\d/.test(refName))
  ) {
    return refName.replace(/^v/i, "");
  }

  // Walk parents for .git (works from apps/mobile and monorepo root).
  try {
    const tag = execSync('git describe --tags --match "v*" --abbrev=0', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (tag) return tag.replace(/^v/i, "");
  } catch {
    /* no tag reachable */
  }
  return null;
}

/**
 * Monotonic Android versionCode from semver: 1.2.1 → 10201
 * @param {string} version
 * @returns {number | undefined}
 */
function versionCodeFromSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return undefined;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => {
  const version = resolveGitVersion() || config.version || "0.0.0";
  const versionCode =
    versionCodeFromSemver(version) ?? config.android?.versionCode ?? 1;

  return {
    ...config,
    version,
    android: {
      ...config.android,
      versionCode,
    },
    extra: {
      ...config.extra,
      appVersion: version,
      author: "srineshr1",
      authorUrl: "https://github.com/srineshr1",
    },
  };
};
