import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { theme } from '../theme/tokens';

export function Button({
  label,
  onPress,
  icon,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const isDisabled = loading || disabled;
  const backgroundColor =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.surface;
  const isLight = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={{
        minHeight: 52,
        borderRadius: 8,
        backgroundColor,
        borderColor: theme.colors.border,
        borderWidth: isLight ? 1 : 0,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      {loading ? <ActivityIndicator color={isLight ? theme.colors.primary : '#fff'} /> : icon}
      <Text
        style={{
          color: isLight ? theme.colors.ink : '#fff',
          fontSize: 16,
          fontWeight: '800',
          opacity: disabled && !loading ? 0.6 : 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
