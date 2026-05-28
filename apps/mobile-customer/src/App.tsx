import 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootNavigator } from './navigation/RootNavigator';
import { theme } from './theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 20_000
    }
  }
});

function FatalErrorFallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas, padding: 32 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.ink, textAlign: 'center' }}>
        Unable to start Benbax
      </Text>
      <Text style={{ color: theme.colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        The app encountered an error during initialisation. Restart the app or reinstall if the issue persists.
      </Text>
    </View>
  );
}

export default function App() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        queryClient.invalidateQueries().catch(() => {});
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary fallback={<FatalErrorFallback />}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </SafeAreaProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
