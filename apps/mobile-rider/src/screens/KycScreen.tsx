import { BadgeCheck, Camera } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';

export function KycScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>KYC</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 8 }}>
        <BadgeCheck size={24} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Verify rider identity</Text>
        <Text style={{ color: theme.colors.muted }}>Upload Ghana Card, license, vehicle details, and complete facial verification.</Text>
      </View>
      <Button label="Upload document" icon={<Camera size={18} color="#fff" />} onPress={() => undefined} />
    </Screen>
  );
}
