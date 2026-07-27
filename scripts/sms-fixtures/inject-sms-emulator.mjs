#!/usr/bin/env node

/**
 * Inject fake SMS into an Android emulator inbox with historical dates.
 *
 * Strategy (reliable on AOSP emulator with adb root):
 *   1. adb root
 *   2. Build SQL that fills canonical_addresses + threads + sms
 *   3. Push SQL to device and run sqlite3 against mmssms.db
 *   4. Restart telephony provider so Messages / Spentd see rows
 *
 * Usage:
 *   node scripts/sms-fixtures/inject-sms-emulator.mjs
 *   node scripts/sms-fixtures/inject-sms-emulator.mjs --fixture path.json
 *   node scripts/sms-fixtures/inject-sms-emulator.mjs --limit 50
 *   node scripts/sms-fixtures/inject-sms-emulator.mjs --clear
 *   node scripts/sms-fixtures/inject-sms-emulator.mjs --serial emulator-5554
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MMSSMS_DB =
  "/data/data/com.android.providers.telephony/databases/mmssms.db";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  if (
    fallback === false &&
    (args[i + 1] == null || args[i + 1].startsWith("--"))
  ) {
    return true;
  }
  return args[i + 1] ?? fallback;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const FIXTURE = resolve(
  flag("fixture", resolve(__dirname, "sms-3months.json")),
);
const LIMIT = flag("limit", null) != null ? Number(flag("limit", "0")) : null;
const SERIAL = flag("serial", null);
const CLEAR = hasFlag("clear");
const DRY = hasFlag("dry-run");

function findAdb() {
  const fromEnv =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    `${process.env.HOME}/Android/Sdk`;
  const candidates = [
    "adb",
    `${fromEnv}/platform-tools/adb`,
    "/home/ricky/Android/Sdk/platform-tools/adb",
  ];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ["version"], { encoding: "utf8" });
      if (r.status === 0) return c;
    } catch {
      /* next */
    }
  }
  throw new Error(
    "adb not found. Install Android platform-tools or set ANDROID_HOME.",
  );
}

/** Host sqlite3 for pull/modify/push when the emulator image has none. */
function findHostSqlite() {
  const fromEnv =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    `${process.env.HOME}/Android/Sdk`;
  const candidates = [
    "sqlite3",
    "/usr/bin/sqlite3",
    `${fromEnv}/platform-tools/sqlite3`,
    `${process.env.HOME}/Android/Sdk/platform-tools/sqlite3`,
  ];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ["-version"], { encoding: "utf8" });
      if (r.status === 0) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

function adb(adbPath, adbArgs, opts = {}) {
  const full = SERIAL ? ["-s", SERIAL, ...adbArgs] : adbArgs;
  const r = spawnSync(adbPath, full, {
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
    ...opts,
  });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`adb ${full.join(" ")} failed (${r.status}): ${err}`);
  }
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * Build SQL script: one thread per unique address, all SMS rows.
 */
function buildSql(messages, { clear }) {
  const lines = [];
  lines.push("PRAGMA foreign_keys=OFF;");
  lines.push("BEGIN TRANSACTION;");

  if (clear) {
    lines.push("DELETE FROM sms;");
    lines.push("DELETE FROM threads;");
    lines.push("DELETE FROM canonical_addresses;");
    // words FTS may reference sms; best-effort
    lines.push("DELETE FROM words;");
  }

  // Unique addresses in first-seen order
  const addresses = [];
  const addrIndex = new Map();
  for (const m of messages) {
    const a = m.address || "UNKNOWN";
    if (!addrIndex.has(a)) {
      addrIndex.set(a, addresses.length + 1); // 1-based after clear insert order
      addresses.push(a);
    }
  }

  // After DELETE, AUTOINCREMENT may continue; use explicit _id for stability
  // when clear=true we reset by deleting; still safer to use last_insert pattern.
  // We'll insert addresses first, map by address string via temp approach:
  // insert all addresses, then SELECT mapping — but pure SQL file is simpler with
  // explicit ids if we cleared tables.

  if (clear) {
    // Reset sequences so _id starts at 1
    lines.push(
      "DELETE FROM sqlite_sequence WHERE name IN ('canonical_addresses','threads','sms');",
    );
    for (let i = 0; i < addresses.length; i++) {
      const id = i + 1;
      lines.push(
        `INSERT INTO canonical_addresses (_id, address) VALUES (${id}, ${sqlString(addresses[i])});`,
      );
    }
  } else {
    // Append mode: insert addresses only if missing; thread/sms get new ids
    for (const a of addresses) {
      lines.push(
        `INSERT INTO canonical_addresses (address) SELECT ${sqlString(a)} WHERE NOT EXISTS (SELECT 1 FROM canonical_addresses WHERE address=${sqlString(a)});`,
      );
    }
  }

  // Thread per address: recipient_ids = canonical _id as text
  // When clear, canonical _id is known (1..n). When not clear, use subquery.
  const threadIdByAddr = new Map();

  if (clear) {
    for (let i = 0; i < addresses.length; i++) {
      const threadId = i + 1;
      const canonId = i + 1;
      const addr = addresses[i];
      threadIdByAddr.set(addr, threadId);
      // newest message snippet filled later; set date to max we'll insert
      const newest = messages
        .filter((m) => (m.address || "UNKNOWN") === addr)
        .reduce((max, m) => Math.max(max, m.dateMs), 0);
      const snippet =
        messages
          .filter((m) => (m.address || "UNKNOWN") === addr)
          .sort((a, b) => b.dateMs - a.dateMs)[0]?.body ?? "";
      const count = messages.filter(
        (m) => (m.address || "UNKNOWN") === addr,
      ).length;
      // sub_id=1 matches emulator default SIM (Google Messages filters on this)
      lines.push(
        `INSERT INTO threads (_id, date, message_count, recipient_ids, snippet, snippet_cs, read, type, error, has_attachment, sub_id) VALUES (${threadId}, ${newest}, ${count}, '${canonId}', ${sqlString(snippet.slice(0, 100))}, 0, 1, 0, 0, 0, 1);`,
      );
    }
  } else {
    for (const addr of addresses) {
      const newest = messages
        .filter((m) => (m.address || "UNKNOWN") === addr)
        .reduce((max, m) => Math.max(max, m.dateMs), 0);
      const snippet =
        messages
          .filter((m) => (m.address || "UNKNOWN") === addr)
          .sort((a, b) => b.dateMs - a.dateMs)[0]?.body ?? "";
      const count = messages.filter(
        (m) => (m.address || "UNKNOWN") === addr,
      ).length;
      // Create thread if none exists for this recipient
      lines.push(
        `INSERT INTO threads (date, message_count, recipient_ids, snippet, snippet_cs, read, type) ` +
          `SELECT ${newest}, ${count}, CAST((SELECT _id FROM canonical_addresses WHERE address=${sqlString(addr)} LIMIT 1) AS TEXT), ${sqlString(snippet.slice(0, 100))}, 0, 1, 0 ` +
          `WHERE NOT EXISTS (SELECT 1 FROM threads WHERE recipient_ids = CAST((SELECT _id FROM canonical_addresses WHERE address=${sqlString(addr)} LIMIT 1) AS TEXT));`,
      );
    }
  }

  for (const m of messages) {
    const addr = m.address || "UNKNOWN";
    const date = Math.floor(m.dateMs);
    const body = m.body ?? "";

    if (clear) {
      const threadId = threadIdByAddr.get(addr);
      lines.push(
        `INSERT INTO sms (thread_id, address, date, date_sent, protocol, read, status, type, body, locked, sub_id, error_code, seen) VALUES (${threadId}, ${sqlString(addr)}, ${date}, ${date}, 0, 1, -1, 1, ${sqlString(body)}, 0, 1, -1, 1);`,
      );
    } else {
      lines.push(
        `INSERT INTO sms (thread_id, address, date, date_sent, protocol, read, status, type, body, locked, sub_id, error_code, seen) VALUES (` +
          `(SELECT _id FROM threads WHERE recipient_ids = CAST((SELECT _id FROM canonical_addresses WHERE address=${sqlString(addr)} LIMIT 1) AS TEXT) LIMIT 1), ` +
          `${sqlString(addr)}, ${date}, ${date}, 0, 1, -1, 1, ${sqlString(body)}, 0, 1, -1, 1);`,
      );
    }
  }

  // Refresh thread snippets / counts
  if (clear) {
    for (let i = 0; i < addresses.length; i++) {
      const threadId = i + 1;
      lines.push(
        `UPDATE threads SET message_count=(SELECT COUNT(*) FROM sms WHERE thread_id=${threadId}), date=(SELECT MAX(date) FROM sms WHERE thread_id=${threadId}), snippet=(SELECT body FROM sms WHERE thread_id=${threadId} ORDER BY date DESC LIMIT 1) WHERE _id=${threadId};`,
      );
    }
  }

  lines.push("COMMIT;");
  lines.push("SELECT 'sms_count=' || COUNT(*) FROM sms;");
  lines.push("SELECT 'thread_count=' || COUNT(*) FROM threads;");
  return lines.join("\n");
}

function main() {
  if (!existsSync(FIXTURE)) {
    console.error(`Fixture not found: ${FIXTURE}`);
    console.error("Run: node scripts/sms-fixtures/generate-sms-fixture.mjs");
    process.exit(1);
  }

  const adbPath = findAdb();
  const devicesOut = adb(adbPath, ["devices"]).stdout;
  const devices = devicesOut
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && l.endsWith("device"));

  if (devices.length === 0) {
    console.error("No adb device/emulator online. Start an AVD first.");
    process.exit(1);
  }
  console.log("adb:", adbPath);
  console.log("devices:", devices.map((d) => d.split(/\s+/)[0]).join(", "));

  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  let messages = fixture.messages ?? [];
  if (LIMIT != null && LIMIT > 0) {
    messages = messages.slice(-LIMIT);
  }

  console.log(
    `Fixture: ${FIXTURE}\n  injecting: ${messages.length}` +
      (fixture.meta?.counts
        ? ` (file has ${fixture.meta.counts.total} total, ${fixture.meta.counts.paymentLike} payment-like)`
        : ""),
  );

  if (messages.length === 0) {
    console.error("No messages to inject.");
    process.exit(1);
  }

  // Default to clear when full fixture; --clear forces, without clear appends
  const doClear = CLEAR || LIMIT == null;

  if (DRY) {
    console.log("Dry run — SQL preview (first 15 lines):");
    const sql = buildSql(messages, { clear: doClear });
    console.log(sql.split("\n").slice(0, 15).join("\n"));
    console.log(`... (${sql.split("\n").length} lines total)`);
    return;
  }

  // Prefer direct DB write (historical dates) when adbd can run as root.
  // Google Play / "user" images refuse root → fall back to `adb emu sms send`
  // (inbox date = now; Spentd still picks paidAt from body date strings).
  console.log("Checking whether adbd can run as root (for historical SMS dates)...");
  adb(adbPath, ["root"], { allowFail: true });
  spawnSync("sleep", ["1"]);
  adb(adbPath, ["wait-for-device"], { allowFail: true });
  const idOut = adb(adbPath, ["shell", "id"], { allowFail: true }).stdout;
  const isRoot = /\buid=0\b/.test(idOut);

  if (!isRoot) {
    console.log(
      "No root (Play/user image). Injecting via emulator console (adb emu sms send).",
    );
    console.log(
      "  Note: SMS timestamps will be 'now'; expense dates still come from message bodies.",
    );
    injectViaEmuSms(adbPath, messages);
    return;
  }

  injectViaSqlite(adbPath, messages, { clear: doClear });
}

/**
 * Inject via `adb emu sms send` — works on non-rooted Google Play AVDs.
 * Bodies keep historical dates for Spentd's paidAt extraction.
 */
function injectViaEmuSms(adbPath, messages) {
  let ok = 0;
  let fail = 0;
  const total = messages.length;
  const started = Date.now();

  for (let i = 0; i < total; i++) {
    const m = messages[i];
    const addr = String(m.address || "UNKNOWN").replace(/[\r\n]/g, " ");
    // Emulator console treats the rest of the line as the body.
    // Strip CR/LF so multi-line bodies don't break the console protocol.
    const body = String(m.body ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim();

    const r = adb(adbPath, ["emu", "sms", "send", addr, body], {
      allowFail: true,
    });
    if (r.status === 0 && !/KO|ERROR|unknown/i.test(r.stdout + r.stderr)) {
      ok++;
    } else {
      fail++;
      if (fail <= 5) {
        console.warn(
          `  fail #${fail}: ${addr} — ${(r.stderr || r.stdout || "unknown").slice(0, 120)}`,
        );
      }
    }

    if ((i + 1) % 50 === 0 || i + 1 === total) {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  … ${i + 1}/${total} sent (${ok} ok, ${fail} fail) [${sec}s]`);
    }

    // Telephony provider drops bursts on Play images — pace sends.
    if (i % 10 === 9) spawnSync("sleep", ["0.12"]);
    else spawnSync("sleep", ["0.03"]);
  }

  // Provider applies emu-sms asynchronously — poll until count stabilizes.
  console.log("Waiting for telephony provider to flush inbox…");
  let contentRows = "0";
  let prev = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    spawnSync("sleep", [attempt === 0 ? "2" : "1.5"]);
    const countOut = adb(
      adbPath,
      [
        "shell",
        "content query --uri content://sms/inbox --projection _id | grep -c '^Row:' || echo 0",
      ],
      { allowFail: true },
    );
    contentRows = (countOut.stdout || "").trim().split("\n").pop() || "0";
    const n = Number(contentRows);
    if (Number.isFinite(n) && n === prev && n > 0) break;
    prev = n;
  }

  console.log(`\ncontent://sms/inbox rows: ${contentRows}`);
  console.log(`emu send: ${ok} ok, ${fail} failed (of ${total})`);

  if (ok < total * 0.9) {
    console.error("✗ Too many failures — check emulator console / adb.");
    process.exit(2);
  }

  console.log(`
✓ Injected ~${ok} messages via adb emu sms send.

Next steps:
  1. Open Google Messages — bank / UPI / noise threads should appear.
  2. Open Spentd (native Android build) → Import from SMS → allow READ_SMS.
  3. Offline parse check:  npm run sms:verify

Note: On non-root AVDs, inbox timestamps are "now". Spentd still uses dates
inside bank SMS bodies for expense paidAt (5-month spread is preserved).
`);
}

/**
 * Root path: write mmssms.db directly so SMS date columns match fixture history.
 */
function injectViaSqlite(adbPath, messages, { clear }) {
  const sql = buildSql(messages, { clear });
  const tmp = mkdtempSync(join(tmpdir(), "sms-inject-"));
  const localSql = join(tmp, "inject.sql");
  const remoteSql = "/data/local/tmp/spentd_sms_inject.sql";
  writeFileSync(localSql, sql, "utf8");

  const hasSqlite = adb(adbPath, ["shell", "which", "sqlite3"], {
    allowFail: true,
  });
  const deviceSqlite =
    hasSqlite.status === 0 && hasSqlite.stdout.includes("sqlite3");

  adb(
    adbPath,
    [
      "shell",
      "kill $(pidof com.android.providers.telephony) 2>/dev/null; true",
    ],
    { allowFail: true },
  );
  spawnSync("sleep", ["0.4"]);

  let applyStdout = "";
  let applyStderr = "";

  if (deviceSqlite) {
    console.log(
      `Pushing SQL (${(sql.length / 1024).toFixed(1)} KB) and applying on-device...`,
    );
    adb(adbPath, ["push", localSql, remoteSql]);
    const result = adb(adbPath, [
      "shell",
      `sqlite3 ${MMSSMS_DB} < ${remoteSql}`,
    ]);
    applyStdout = result.stdout;
    applyStderr = result.stderr;
    adb(adbPath, ["shell", `rm -f ${remoteSql}`], { allowFail: true });
  } else {
    const hostSqlite = findHostSqlite();
    if (!hostSqlite) {
      console.error(
        "No sqlite3 on device or host. Install sqlite3 or use emu sms fallback.",
      );
      process.exit(1);
    }
    console.log(
      `Device has no sqlite3 — using host ${hostSqlite} (pull → apply → push)...`,
    );
    const localDb = join(tmp, "mmssms.db");
    adb(adbPath, ["pull", MMSSMS_DB, localDb]);
    adb(adbPath, ["pull", `${MMSSMS_DB}-wal`, `${localDb}-wal`], {
      allowFail: true,
    });
    adb(adbPath, ["pull", `${MMSSMS_DB}-shm`, `${localDb}-shm`], {
      allowFail: true,
    });

    const applied = spawnSync(hostSqlite, [localDb], {
      encoding: "utf8",
      input: sql,
      maxBuffer: 40 * 1024 * 1024,
    });
    if (applied.status !== 0) {
      console.error(
        `Host sqlite3 failed (${applied.status}): ${(applied.stderr || applied.stdout || "").trim()}`,
      );
      process.exit(1);
    }
    applyStdout = (applied.stdout || "").trim();
    applyStderr = (applied.stderr || "").trim();

    spawnSync(hostSqlite, [localDb, "PRAGMA wal_checkpoint(FULL);"], {
      encoding: "utf8",
    });

    adb(
      adbPath,
      [
        "shell",
        `rm -f ${MMSSMS_DB}-wal ${MMSSMS_DB}-shm ${MMSSMS_DB}-journal`,
      ],
      { allowFail: true },
    );
    adb(adbPath, ["push", localDb, MMSSMS_DB]);
    adb(
      adbPath,
      [
        "shell",
        `chown radio:radio ${MMSSMS_DB} 2>/dev/null || chown system:system ${MMSSMS_DB}; chmod 660 ${MMSSMS_DB}`,
      ],
      { allowFail: true },
    );
  }

  console.log(applyStdout || "(no stdout)");
  if (applyStderr) console.warn(applyStderr);

  try {
    unlinkSync(localSql);
  } catch {
    /* ignore */
  }

  adb(
    adbPath,
    [
      "shell",
      "kill $(pidof com.android.providers.telephony) 2>/dev/null; true",
    ],
    { allowFail: true },
  );
  spawnSync("sleep", ["0.5"]);

  console.log("Refreshing Google Messages (clears bugle cache, re-syncs)...");
  adb(adbPath, ["shell", "pm", "clear", "com.google.android.apps.messaging"], {
    allowFail: true,
  });
  adb(
    adbPath,
    [
      "shell",
      "cmd",
      "role",
      "add-role-holder",
      "android.app.role.SMS",
      "com.google.android.apps.messaging",
    ],
    { allowFail: true },
  );
  adb(
    adbPath,
    [
      "shell",
      "settings",
      "put",
      "secure",
      "sms_default_application",
      "com.google.android.apps.messaging",
    ],
    { allowFail: true },
  );
  adb(
    adbPath,
    [
      "shell",
      "monkey",
      "-p",
      "com.google.android.apps.messaging",
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ],
    { allowFail: true },
  );
  spawnSync("sleep", ["2"]);

  let dbCount = "?";
  if (deviceSqlite) {
    const count = adb(
      adbPath,
      ["shell", `sqlite3 ${MMSSMS_DB} "SELECT COUNT(*) FROM sms;"`],
      { allowFail: true },
    );
    if (count.status === 0) dbCount = count.stdout;
  } else {
    const hostSqlite = findHostSqlite();
    if (hostSqlite) {
      const probe = join(tmp, "mmssms-probe.db");
      adb(adbPath, ["pull", MMSSMS_DB, probe], { allowFail: true });
      const c = spawnSync(hostSqlite, [probe, "SELECT COUNT(*) FROM sms;"], {
        encoding: "utf8",
      });
      if (c.status === 0) dbCount = (c.stdout || "").trim();
    }
  }

  const content = adb(
    adbPath,
    [
      "shell",
      "content",
      "query",
      "--uri",
      "content://sms/inbox",
      "--projection",
      "_id",
    ],
    { allowFail: true },
  );
  const contentRows = (content.stdout || "")
    .split("\n")
    .filter((l) => l.includes("Row:")).length;

  console.log(`\nDB sms rows: ${dbCount}`);
  console.log(`content://sms/inbox rows: ~${contentRows}`);

  const dbNum = Number(dbCount);
  if (Number.isFinite(dbNum) && dbNum < messages.length && clear) {
    console.error("✗ Fewer SMS in DB than injected — check SQL errors above.");
    process.exit(2);
  }

  console.log(`
✓ Injected ${messages.length} messages into emulator inbox (historical dates).

Next steps:
  1. Open Google Messages — you should see bank / UPI / noise threads.
  2. Open Spentd (native Android build) → Import from SMS → allow READ_SMS.
  3. Offline parse check:  npm run sms:verify
`);
}

main();
