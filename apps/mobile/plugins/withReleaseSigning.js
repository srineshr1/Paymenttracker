/**
 * Expo config plugin: wire release signing from env / keystore.properties.
 * Avoids shipping debug-signed release APKs that Play Protect hard-blocks
 * when the app requests SMS permissions.
 */
const { withAppBuildGradle } = require("@expo/config-plugins");

const DEBUG_SIGNING_CONFIG = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // Prefer env (CI) → keystore.properties (local) → leave storeFile null.
            // Debug-signed release APKs are often hard-blocked by Google Play Protect.
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
            }

            def storePath = System.getenv("SPENTD_UPLOAD_STORE_FILE")
                ?: keystoreProperties["storeFile"]
            def storePass = System.getenv("SPENTD_UPLOAD_STORE_PASSWORD")
                ?: keystoreProperties["storePassword"]
            def keyAliasName = System.getenv("SPENTD_UPLOAD_KEY_ALIAS")
                ?: keystoreProperties["keyAlias"]
            def keyPass = System.getenv("SPENTD_UPLOAD_KEY_PASSWORD")
                ?: keystoreProperties["keyPassword"]

            if (storePath && storePass && keyAliasName && keyPass) {
                def store = file(storePath)
                if (!store.isAbsolute()) {
                    store = rootProject.file(storePath)
                }
                if (!store.exists()) {
                    store = file(storePath)
                }
                storeFile store
                storePassword storePass
                keyAlias keyAliasName
                keyPassword keyPass
            }
        }
    }`;

const RELEASE_SIGNING_DEBUG = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_SIGNING_CONDITIONAL = `        release {
            // Prefer release keystore; fall back to debug with a warning.
            if (signingConfigs.release.storeFile != null) {
                signingConfig signingConfigs.release
            } else {
                logger.warn("WARNING: No release keystore configured — signing release with debug keystore. " +
                    "Play Protect often blocks debug-signed APKs that request SMS. " +
                    "Set SPENTD_UPLOAD_* env vars or android/keystore.properties.")
                signingConfig signingConfigs.debug
            }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes("SPENTD_UPLOAD_STORE_FILE")) {
      return cfg;
    }

    if (contents.includes(DEBUG_SIGNING_CONFIG)) {
      contents = contents.replace(DEBUG_SIGNING_CONFIG, SIGNING_CONFIGS);
    } else {
      console.warn(
        "[withReleaseSigning] Expected debug signingConfigs block not found; signing patch skipped.",
      );
    }

    if (contents.includes(RELEASE_SIGNING_DEBUG)) {
      contents = contents.replace(RELEASE_SIGNING_DEBUG, RELEASE_SIGNING_CONDITIONAL);
    } else if (
      contents.includes("signingConfig signingConfigs.debug") &&
      contents.includes("buildTypes")
    ) {
      // Fallback: only rewrite the release block's signing line once
      let seenRelease = false;
      contents = contents.replace(
        /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
        (match) => {
          if (seenRelease) return match;
          seenRelease = true;
          return match.replace(
            /signingConfig\s+signingConfigs\.debug/,
            `if (signingConfigs.release.storeFile != null) {
                signingConfig signingConfigs.release
            } else {
                logger.warn("WARNING: No release keystore configured — signing release with debug keystore.")
                signingConfig signingConfigs.debug
            }`,
          );
        },
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withReleaseSigning;
