// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Keep the Metro server root at the project (via EXPO_NO_METRO_WORKSPACE_ROOT) so
// expo-updates resolves the entry file relative to this app and not the monorepo
// root (which duplicates the path and breaks the "Configure expo-updates" build
// phase). Manually wire up the monorepo so hoisted dependencies still resolve.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
