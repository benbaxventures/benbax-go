import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type Props = PropsWithChildren<{
  fallback?: ReactNode;
  onReset?: () => void;
}>;

type State = {
  hasError: boolean;
  error: Error | null;
};

let globalFallbackHandler: (() => void) | null = null;

export function setGlobalErrorFallback(handler: () => void) {
  globalFallbackHandler = handler;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[ErrorBoundary]', error.message, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleFullReset = () => {
    globalFallbackHandler?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.canvas,
            padding: 32,
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: theme.colors.ink,
              textAlign: 'center',
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 }}
          >
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={{
              marginTop: 8,
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
          </Pressable>
          {typeof globalFallbackHandler === 'function' ? (
            <Pressable
              onPress={this.handleFullReset}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Restart app</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return this.props.children;
  }
}
