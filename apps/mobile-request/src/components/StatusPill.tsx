import { Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type Props = {
  label: string;
  tone?: 'success' | 'warning' | 'info' | 'danger';
};

export function StatusPill({ label, tone = 'info' }: Props) {
  const color =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.accent
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.info;

  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: `${color}1A`, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}
