// Metro resolver config for tokmato-mobile.
// - Hoists @tokmato/shared/* to the parent repo's shared/ directory so
//   the RN app reuses the same Zustand store / schema / types as web.
// - watchFolders includes the parent so live editing shared/ triggers
//   metro reload.

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@tokmato/shared": path.resolve(monorepoRoot, "shared"),
};

module.exports = config;
