import { Component, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { theme } from '../theme/tokens';
import { Button } from './Button';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Catches render/lifecycle errors anywhere below it so a single screen crash
 * shows a recoverable fallback instead of taking the whole app down.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.warn('[ErrorBoundary] Caught render error:', error?.message ?? error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', gap: 12 }}
          style={{ flexGrow: 0 }}
        >
          <Text
            style={{
              color: theme.colors.ink,
              fontWeight: '900',
              fontSize: 20,
              textAlign: 'center',
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            The app hit an unexpected error. Tap below to reload this screen. If it keeps happening,
            close and reopen the app.
          </Text>
          <Button label="Reload" onPress={this.handleReset} />
        </ScrollView>
      </View>
    );
  }
}
