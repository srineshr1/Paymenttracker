#!/usr/bin/env node
/**
 * Build GitHub Release notes for a tag.
 *
 * Prefer the matching section in CHANGELOG.md; always append a commit list
 * between the previous tag and this one, plus an install blurb for the APK.
 *
 * Usage:
 *   node scripts/release-notes.mjs [v1.2.1] > /tmp/notes.md
 *   SPENTD_VERSION=1.2.1 node scripts/release-notes.mjs
 *
 * Env:
 *   SPENTD_VERSION / GITHUB_REF_NAME — tag or version without needing argv
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function sh(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    cwd: root,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function resolveTag() {
  const arg = process.argv[2]?.trim();
  if (arg) return arg.startsWith("v") ? arg : `v${arg}`;
  const env =
    process.env.SPENTD_VERSION?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    "";
  if (env) return env.startsWith("v") ? env : `v${env}`;
  try {
    return sh('git describe --tags --match "v*" --abbrev=0');
  } catch {
    return "v0.0.0";
  }
}

function previousTag(tag) {
  try {
    // Prefer the tag immediately before this one in version order among v*.
    const tags = sh('git tag --list "v*" --sort=-v:refname')
      .split("\n")
      .filter(Boolean);
    const idx = tags.indexOf(tag);
    if (idx >= 0 && tags[idx + 1]) return tags[idx + 1];
    // Fallback: first reachable ancestor tag
    return sh(`git describe --tags --match "v*" --abbrev=0 ${tag}^`);
  } catch {
    return null;
  }
}

/**
 * Extract "## [1.2.1] ..." section from CHANGELOG.md (Keep a Changelog).
 * @param {string} version without leading v
 */
function changelogSection(version) {
  const file = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  // Match ## [1.2.1] or ## 1.2.1
  const re = new RegExp(
    `^##\\s+\\[?${version.replace(/\./g, "\\.")}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "m",
  );
  const m = text.match(re);
  if (!m) return null;
  const body = m[1].trim();
  return body.length ? body : null;
}

function commitList(fromTag, toTag) {
  try {
    const range = fromTag ? `${fromTag}..${toTag}` : toTag;
    const log = sh(`git log ${range} --pretty=format:"- %s (%h)" --no-merges`);
    return log || null;
  } catch {
    return null;
  }
}

const tag = resolveTag();
const version = tag.replace(/^v/i, "");
const prev = previousTag(tag);
const cl = changelogSection(version);
const commits = commitList(prev, tag);

const lines = [];
lines.push(`## Spentd ${version}`);
lines.push("");

if (cl) {
  lines.push(cl);
  lines.push("");
} else {
  lines.push("Privacy-first Android expense tracker — local vault, SMS & screenshot import.");
  lines.push("");
}

if (commits) {
  lines.push("### Changes");
  lines.push("");
  lines.push(commits);
  lines.push("");
}

lines.push("### Install");
lines.push("");
lines.push("1. Download **`spentd-v" + version + ".apk`** below.");
lines.push("2. On Android, open the file and allow **Install unknown apps** if asked.");
lines.push("3. If Play Protect blocks it: **More details → Install anyway**.");
lines.push("");

if (prev) {
  lines.push(
    `**Full Changelog**: https://github.com/srineshr1/Paymenttracker/compare/${prev}...${tag}`,
  );
  lines.push("");
}

process.stdout.write(`${lines.join("\n").trimEnd()}\n`);
