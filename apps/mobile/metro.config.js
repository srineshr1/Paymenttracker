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

const svgRoot = path.resolve(monorepoRoot, "node_modules/react-native-svg");

config.resolver.extraNodeModules = {
  "@paymenttracker/shared": path.resolve(monorepoRoot, "packages/shared"),
  // Force one copy — monorepo + gifted-charts can otherwise nest mismatched versions
  "react-native-svg": svgRoot,
};

// Prefer compiled commonjs over package "react-native": "src/*" source entry.
// Source resolution under disableHierarchicalLookup has broken extractBrush paths.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-svg") {
    return {
      type: "sourceFile",
      filePath: path.join(svgRoot, "lib/commonjs/index.js"),
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// expo-sqlite web worker imports wa-sqlite.wasm
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

module.exports = config;
