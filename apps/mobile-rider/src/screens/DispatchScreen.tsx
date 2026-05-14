import { useEffect, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { CheckCircle2, Power, XCircle } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { realtimeEvents } from '@benbax/shared';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { useRiderStore } from '../store/riderStore';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export function DispatchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isOnline, setOnline, currentOffer, setCurrentOffer } = useRiderStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.on(realtimeEvents.riderOffer, (offer) => setCurrentOffer(offer));
      cleanup = () => {
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [setCurrentOffer]);

  async function toggleOnline() {
    setLoading(true);
    const next = !isOnline;
    try {
      await apiRequest('/riders/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: next, latitude: 5.6508, longitude: -0.1668 })
      });
      setOnline(next);
    } finally {
      setLoading(false);
    }
  }

  async function acceptOffer() {
    if (!currentOffer) return;
    await apiRequest(`/dispatch/assignments/${currentOffer.id}/accept`, { method: 'POST' });
    navigation.navigate('ActiveDelivery', { deliveryId: currentOffer.deliveryId });
    setCurrentOffer(null);
  }

  async function rejectOffer() {
    if (!currentOffer) return;
    await apiRequest(`/dispatch/assignments/${currentOffer.id}/reject`, { method: 'POST' });
    setCurrentOffer(null);
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.ink }}>Dispatch</Text>
        <Text style={{ color: theme.colors.muted }}>Go online to receive the nearest best-fit Benbax jobs.</Text>
      </View>

      <Pressable
        onPress={toggleOnline}
        style={{
          backgroundColor: isOnline ? theme.colors.primary : theme.colors.surface,
          borderRadius: 8,
          padding: 18,
          gap: 8,
          borderWidth: isOnline ? 0 : 1,
          borderColor: theme.colors.border
        }}
      >
        <Power size={26} color={isOnline ? '#fff' : theme.colors.primary} />
        <Text style={{ color: isOnline ? '#fff' : theme.colors.ink, fontSize: 24, fontWeight: '900' }}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
        <Text style={{ color: isOnline ? '#D7FFF5' : theme.colors.muted }}>{loading ? 'Updating...' : 'Tap to change availability'}</Text>
      </Pressable>

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 10 }}>
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Current offer</Text>
        {currentOffer ? (
          <>
            <Text style={{ color: theme.colors.muted }}>Delivery {currentOffer.deliveryId}</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>Dispatch score {currentOffer.score}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Accept" icon={<CheckCircle2 size={18} color="#fff" />} onPress={acceptOffer} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Reject" icon={<XCircle size={18} color="#fff" />} onPress={rejectOffer} variant="danger" />
              </View>
            </View>
          </>
        ) : (
          <Text style={{ color: theme.colors.muted }}>No active offer. Fresh GPS and high completion rate improve matching.</Text>
        )}
      </View>
    </Screen>
  );
}
