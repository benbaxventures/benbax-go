import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { theme } from '../theme/tokens';
import { Button } from './Button';

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: 'error' | 'offline' | 'empty';
  compact?: boolean;
};

export function ErrorState({
  title,
  message,
  onRetry,
  variant = 'error',
  compact = false,
}: ErrorStateProps) {
  const IconComponent = variant === 'offline' ? WifiOff : AlertTriangle;

  const defaultTitle =
    variant === 'offline'
      ? 'No internet connection'
      : variant === 'empty'
        ? 'Nothing here yet'
        : 'Something went wrong';

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: compact ? 14 : 20,
        alignItems: 'center',
        gap: compact ? 8 : 12,
        borderWidth: 1,
        borderColor:
          variant === 'offline' ? theme.colors.accent + '40' : theme.colors.danger + '20',
      }}
    >
      <View
        style={{
          width: compact ? 36 : 48,
          height: compact ? 36 : 48,
          borderRadius: compact ? 18 : 24,
          backgroundColor:
            variant === 'offline' ? theme.colors.accent + '18' : theme.colors.danger + '12',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconComponent
          size={compact ? 18 : 24}
          color={variant === 'offline' ? theme.colors.accent : theme.colors.danger}
        />
      </View>

      <View style={{ gap: 4, alignItems: 'center' }}>
        <Text
          style={{
            color: theme.colors.ink,
            fontWeight: '900',
            fontSize: compact ? 14 : 16,
            textAlign: 'center',
          }}
        >
          {title ?? defaultTitle}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: compact ? 12 : 14,
            textAlign: 'center',
            lineHeight: compact ? 16 : 20,
          }}
        >
          {message}
        </Text>
      </View>

      {onRetry ? (
        <Button label="Try again" icon={<RefreshCw size={16} color="#fff" />} onPress={onRetry} />
      ) : null}
    </View>
  );
}
