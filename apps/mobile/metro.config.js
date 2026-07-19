const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  "@paymenttracker/shared": path.resolve(monorepoRoot, "packages/shared"),
};

// expo-sqlite web worker imports wa-sqlite.wasm
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

module.exports = config;
