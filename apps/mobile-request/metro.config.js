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

// The workspace root node_modules holds mobile-driver's Expo SDK 54 / React 19.1
// copies of the packages below, hoisted there by npm. This app ships SDK 55
// native modules and React 19.2, so the bundle must contain exactly one copy of
// each — the app's own. Without this pin, root-hoisted packages (expo-updates,
// expo-notifications, react-navigation, ...) resolve the SDK 54 / React 19.1
// copies and the release APK crashes instantly on launch (JS <-> native API
// mismatch in expo-modules-core plus duplicate React instances).
const appNodeModules = path.join(projectRoot, 'node_modules');
const singletonOrigins = {
  react: appNodeModules,
  'react-dom': appNodeModules,
  'react-native': appNodeModules,
  expo: appNodeModules,
  // These live nested under the app's expo package, so resolve them as if the
  // import came from inside it.
  'expo-modules-core': path.join(appNodeModules, 'expo'),
  'expo-asset': path.join(appNodeModules, 'expo'),
  'expo-file-system': path.join(appNodeModules, 'expo'),
  'expo-font': path.join(appNodeModules, 'expo'),
  'expo-keep-awake': path.join(appNodeModules, 'expo'),
};

function packageNameOf(moduleName) {
  if (moduleName.startsWith('@')) {
    return moduleName.split('/').slice(0, 2).join('/');
  }
  return moduleName.split('/')[0];
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = singletonOrigins[packageNameOf(moduleName)];
  if (origin) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(origin, 'package.json') },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
