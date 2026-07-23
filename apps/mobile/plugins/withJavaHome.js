/**
 * Pin the Android build to JDK 21 when available.
 * System Java 26 breaks AGP's JdkImageTransform (jlink) on recent Arch/Omarchy.
 */
const { withGradleProperties } = require("expo/config-plugins");
const fs = require("node:fs");

const CANDIDATES = [
  process.env.JAVA_HOME,
  "/usr/lib/jvm/java-21-openjdk",
  "/usr/lib/jvm/java-17-openjdk",
  "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home",
].filter(Boolean);

function resolveJavaHome() {
  for (const p of CANDIDATES) {
    if (p && fs.existsSync(p) && fs.existsSync(`${p}/bin/java`)) return p;
  }
  return null;
}

function withJavaHome(config) {
  const home = resolveJavaHome();
  if (!home) return config;

  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const idx = props.findIndex(
      (p) => p.type === "property" && p.key === "org.gradle.java.home",
    );
    const entry = {
      type: "property",
      key: "org.gradle.java.home",
      value: home,
    };
    if (idx >= 0) props[idx] = entry;
    else props.push(entry);
    return cfg;
  });
}

module.exports = withJavaHome;
