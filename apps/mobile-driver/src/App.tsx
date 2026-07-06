import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatedSplashScreen } from './components/AnimatedSplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useOTAUpdates } from './hooks/useOTAUpdates';
import { RootNavigator } from './navigation/RootNavigator';

// Keep the splash screen visible while we load the app
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export default function App() {
  useOTAUpdates();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashReady = useCallback(() => {
    setSplashDone(true);
  }, []);

  if (!splashDone) {
    return <AnimatedSplashScreen onReady={handleSplashReady} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
          <StatusBar style="dark" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
