import { CalendarClock, CheckCircle2, Clock, MapPin, Navigation } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { displayPlaceLabel } from '../services/placeName';
import type { OpenRideRequest } from '../store/driverStore';
import { theme } from '../theme/tokens';
import { Button } from './Button';

type Props = {
  request: OpenRideRequest;
  accepting: boolean;
  /** Another accept is in flight; block double-taps across cards. */
  disabled?: boolean;
  highlighted?: boolean;
  onAccept: (request: OpenRideRequest) => void;
  onNavigate: (request: OpenRideRequest) => void;
  onPress?: (request: OpenRideRequest) => void;
};

/**
 * A measured distance, never floored to look tidy. Below 20 m the phone's own
 * GPS accuracy is the limiting factor, so we say that instead of printing a
 * precise-looking number we cannot stand behind.
 */
export function formatKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return meters < 20 ? 'under 20 m' : `${Math.round(meters / 10) * 10} m`;
  }
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

/**
 * One waiting ride request in the driver's open list: who, where from/to,
 * how far away the pickup is, and what it pays — with Accept and Route.
 */
export function RideRequestCard({
  request,
  accepting,
  disabled,
  highlighted,
  onAccept,
  onNavigate,
  onPress,
}: Props) {
  const name = request.passengerName || 'Passenger';
  const scheduled = request.scheduledFor && new Date(request.scheduledFor) > new Date();

  return (
    <Pressable
      onPress={() => onPress?.(request)}
      accessibilityRole="button"
      accessibilityLabel={`Ride request from ${name}, pickup ${displayPlaceLabel(request.pickup.label, request.pickup.address, 'Pickup')}`}
      style={{
        borderRadius: 14,
        borderWidth: highlighted ? 2 : 1,
        borderColor: highlighted ? theme.colors.primary : theme.colors.border,
        backgroundColor: highlighted ? theme.colors.primary + '0D' : theme.colors.canvas,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#F59E0B',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 15 }}>{name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {scheduled ? (
              <CalendarClock size={12} color={theme.colors.muted} />
            ) : (
              <Clock size={12} color={theme.colors.muted} />
            )}
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {scheduled
                ? `Scheduled ${new Date(request.scheduledFor!).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : timeAgo(request.createdAt)}
              {' · '}
              {formatKm(request.distanceToPickupKm)} to pickup
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 17 }}>
            GHS {request.fare.toFixed(2)}
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
            {formatKm(request.tripDistanceKm)} · {request.etaMinutes} min
          </Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color={theme.colors.primary} />
          <Text style={{ flex: 1, color: theme.colors.ink, fontSize: 13 }} numberOfLines={1}>
            {displayPlaceLabel(request.pickup.label, request.pickup.address, 'Pickup')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color="#EF4444" />
          <Text style={{ flex: 1, color: theme.colors.muted, fontSize: 13 }} numberOfLines={1}>
            {displayPlaceLabel(request.dropoff.label, request.dropoff.address, 'Drop-off')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1.4 }}>
          <Button
            label="Accept"
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={() => onAccept(request)}
            loading={accepting}
            disabled={Boolean(disabled) && !accepting}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Route"
            icon={<Navigation size={18} color={theme.colors.ink} />}
            onPress={() => onNavigate(request)}
            variant="secondary"
          />
        </View>
      </View>
    </Pressable>
  );
}
