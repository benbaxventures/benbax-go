const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so shared packages hot-reload.
config.watchFolders = [workspaceRoot];

// Resolve packages from the app's node_modules FIRST, then the hoisted root.
// Combined with disableHierarchicalLookup, this guarantees a single copy of
// react-native (0.81.5 for SDK 54) even though mobile-request hoists 0.83.6
// to the workspace root. Two copies of react-native in one bundle cause
// "[runtime not ready]: TypeError: property is not writable" in Expo Go.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  // npm nests dedupe-conflicted RN core packages (e.g. @react-native/
  // virtualized-lists@0.81.5) under react-native's own node_modules; include
  // it so they win over the root's 0.83.6 copies.
  path.resolve(projectRoot, 'node_modules', 'react-native', 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
