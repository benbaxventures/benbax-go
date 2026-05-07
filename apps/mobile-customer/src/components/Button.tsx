import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { theme } from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet';
};

export function Button({ label, onPress, icon, loading, variant = 'primary' }: Props) {
  const isPrimary = variant === 'primary';
  const backgroundColor = isPrimary ? theme.colors.primary : variant === 'secondary' ? theme.colors.surface : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={{
        minHeight: 52,
        borderRadius: theme.radius.md,
        backgroundColor,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        opacity: loading ? 0.72 : 1
      }}
    >
      {loading ? <ActivityIndicator color={isPrimary ? '#fff' : theme.colors.primary} /> : icon}
      <Text style={{ color: isPrimary ? '#fff' : theme.colors.ink, fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
