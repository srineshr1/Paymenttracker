/**
 * Expo config plugin: keep custom SmsInbox native module across prebuild.
 *
 * - Copies Kotlin sources into the app package
 * - Registers SmsInboxPackage in MainApplication
 * - Ensures READ_SMS + RECEIVE_SMS permissions
 */
const {
  withDangerousMod,
  withMainApplication,
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_DIR = "com/paymenttracker/ledger";
const SOURCE_FILES = ["SmsInboxModule.kt", "SmsInboxPackage.kt"];

function copySmsKotlinSources(projectRoot, platformProjectRoot) {
  const srcDir = path.join(projectRoot, "modules", "sms-inbox");
  const destDir = path.join(
    platformProjectRoot,
    "app",
    "src",
    "main",
    "java",
    ...PACKAGE_DIR.split("/"),
  );

  if (!fs.existsSync(srcDir)) {
    throw new Error(
      `[withSmsInbox] Missing source dir: ${srcDir}. Expected SmsInboxModule.kt + SmsInboxPackage.kt`,
    );
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (const file of SOURCE_FILES) {
    const from = path.join(srcDir, file);
    const to = path.join(destDir, file);
    if (!fs.existsSync(from)) {
      throw new Error(`[withSmsInbox] Missing ${from}`);
    }
    fs.copyFileSync(from, to);
  }
}

function withSmsInboxSources(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      copySmsKotlinSources(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
      );
      return cfg;
    },
  ]);
}

/**
 * Ensure MainApplication registers SmsInboxPackage inside PackageList(...).packages.apply { }
 */
function withSmsInboxMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Already registered
    if (contents.includes("SmsInboxPackage()")) {
      return cfg;
    }

    // Expo / RN New Architecture style: PackageList(this).packages.apply { ... }
    if (contents.includes("PackageList(this).packages.apply")) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        (match) =>
          `${match}\n          // On-device SMS inbox reader (Android READ_SMS)\n          add(SmsInboxPackage())`,
      );
    } else if (contents.includes("packages.apply")) {
      contents = contents.replace(
        /packages\.apply\s*\{/,
        (match) =>
          `${match}\n          // On-device SMS inbox reader (Android READ_SMS)\n          add(SmsInboxPackage())`,
      );
    } else if (contents.includes("return packages")) {
      // Older template: getPackages() { val packages = PackageList(this).packages; return packages }
      contents = contents.replace(
        /return packages/,
        "packages.add(SmsInboxPackage())\n            return packages",
      );
    } else {
      console.warn(
        "[withSmsInbox] Could not find PackageList registration site in MainApplication; SMS package may be missing.",
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withSmsInboxPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      "android.permission.READ_SMS",
      "android.permission.RECEIVE_SMS",
    ]);
    return cfg;
  });
}

function withSmsInbox(config) {
  config = withSmsInboxSources(config);
  config = withSmsInboxMainApplication(config);
  config = withSmsInboxPermissions(config);
  return config;
}

module.exports = withSmsInbox;
