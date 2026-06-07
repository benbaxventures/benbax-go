import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

/**
 * Diagnostic minimal app shell.
 * To use: change `App.tsx` to `import App from './App.isolate'`
 */
export function MinimalApp() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Phase 1: bare react-native</Text>
      <StatusBar style="dark" />
    </View>
  );
}

export default MinimalApp;
