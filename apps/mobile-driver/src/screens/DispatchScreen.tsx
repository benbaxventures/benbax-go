import { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { CheckCircle2, Crosshair, Power, XCircle } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { apiRequest } from '../services/api';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useDriverStore } from '../store/driverStore';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export function DispatchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isOnline, setOnline, currentOffer, setCurrentOffer } = useDriverStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude, loading: locationLoading, requestLocation } = useCurrentLocation();

  async function toggleOnline() {
    setLoading(true);
    const next = !isOnline;
    setError(null);

    let coords = { latitude, longitude };
    if (latitude !== 0 || longitude !== 0) {
      coords = { latitude, longitude };
    } else {
      coords = (await requestLocation()) ?? coords;
    }

    const lat = coords.latitude;
    const lng = coords.longitude;

    if (next && (!lat || !lng)) {
      setError('Turn on location and tap Update location before going online.');
      setLoading(false);
      return;
    }

    try {
      await apiRequest('/drivers/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: next, latitude: lat, longitude: lng })
      });
      setOnline(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update availability.');
    } finally {
      setLoading(false);
    }
  }

  async function acceptOffer() {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/ride-dispatch/assignments/${currentOffer.id}/accept`, { method: 'POST' });
      navigation.navigate('ActiveTrip', { tripId: currentOffer.tripId });
      setCurrentOffer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this offer.');
    }
  }

  async function rejectOffer() {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/ride-dispatch/assignments/${currentOffer.id}/reject`, { method: 'POST' });
      setCurrentOffer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this offer.');
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.ink }}>Dispatch</Text>
        <Text style={{ color: theme.colors.muted }}>Go online to receive nearby passenger trip requests.</Text>
      </View>

      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

      <Pressable
        onPress={requestLocation}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 6, paddingHorizontal: 12,
          alignSelf: 'flex-start', borderRadius: 6,
          backgroundColor: theme.colors.surface
        }}
      >
        <Crosshair size={14} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
          {locationLoading ? 'Detecting...' : latitude && longitude ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Update location'}
        </Text>
      </Pressable>

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
            <Text style={{ color: theme.colors.muted }}>Trip {currentOffer.tripId}</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>Match score {currentOffer.score}</Text>
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
          <Text style={{ color: theme.colors.muted }}>No active request. Fresh GPS, high acceptance, and strong ratings improve matching.</Text>
        )}
      </View>
    </Screen>
  );
}
