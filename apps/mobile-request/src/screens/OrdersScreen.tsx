import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { useDeliveries } from '../hooks/useDeliveries';
import { theme } from '../theme/tokens';

export function OrdersScreen() {
  const { data, isLoading } = useDeliveries();

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Orders</Text>
      {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {!isLoading && !data?.length ? (
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 18 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>No deliveries yet</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Your active and past deliveries will appear here.</Text>
        </View>
      ) : null}
      {data?.map((delivery) => (
        <View key={delivery.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 8 }}>
          <StatusPill label={delivery.status} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
            {delivery.pickup.label} to {delivery.dropoff.label}
          </Text>
          <Text style={{ color: theme.colors.muted }}>GHS {delivery.quote?.total ?? '--'} · {delivery.category}</Text>
        </View>
      ))}
    </Screen>
  );
}
