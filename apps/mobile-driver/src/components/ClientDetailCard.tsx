import { CheckCircle2, Flag, MapPin, Navigation, User, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { NearbyClient, OpenRideRequest } from '../store/driverStore';
import { theme } from '../theme/tokens';
import { Button } from './Button';
import { formatKm, timeAgo } from './RideRequestCard';

type NavKind = 'client' | 'pickup' | 'dropoff';

type Props = {
  client: NearbyClient;
  /** Live straight-line distance from the driver, recomputed as both move. */
  distanceKm: number | null;
  request?: OpenRideRequest | undefined;
  accepting: boolean;
  onAccept: (request: OpenRideRequest) => void;
  onNavigate: (kind: NavKind) => void;
  onClose: () => void;
};

const SERVICE_LABELS = { economy: 'Economy', comfort: 'Comfort', premium: 'Premium' } as const;

/**
 * Everything the driver can see about one online passenger, live: where they
 * are, how far, how long they've been online, and — if they're requesting a
 * ride — the trip itself with an Accept button. Every location is one tap
 * from navigation.
 */
export function ClientDetailCard({
  client,
  distanceKm,
  request,
  accepting,
  onAccept,
  onNavigate,
  onClose,
}: Props) {
  const name = client.name || request?.passengerName || 'Passenger';

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: request ? '#F59E0B' : theme.colors.primary,
        backgroundColor: theme.colors.canvas,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: request ? '#F59E0B' : '#22C55E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <User size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 16 }}>{name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' }} />
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Online {timeAgo(client.since)} · {formatKm(distanceKm)} away
              {client.serviceClass ? ` · ${SERVICE_LABELS[client.serviceClass]}` : ''}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close passenger details"
          hitSlop={10}
          style={{ padding: 4 }}
        >
          <X size={20} color={theme.colors.muted} />
        </Pressable>
      </View>

      {request ? (
        <View
          style={{
            backgroundColor: '#F59E0B14',
            borderRadius: 10,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#B45309', fontWeight: '900', fontSize: 12 }}>
              REQUESTING A RIDE · {timeAgo(request.createdAt)}
            </Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 15 }}>
              GHS {request.fare.toFixed(2)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MapPin size={14} color={theme.colors.primary} />
            <Text style={{ flex: 1, color: theme.colors.ink, fontSize: 13 }} numberOfLines={2}>
              {request.pickup.label}
              {request.pickup.landmark ? ` (${request.pickup.landmark})` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Flag size={14} color="#EF4444" />
            <Text style={{ flex: 1, color: theme.colors.ink, fontSize: 13 }} numberOfLines={2}>
              {request.dropoff.label}
            </Text>
          </View>
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            Trip {formatKm(request.tripDistanceKm)} · about {request.etaMinutes} min
            {request.notes ? ` · “${request.notes}”` : ''}
          </Text>
          <Button
            label="Accept ride"
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={() => onAccept(request)}
            loading={accepting}
          />
        </View>
      ) : (
        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
          Browsing the app — no ride requested yet. Head their way and they may book you.
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <NavChip label="To passenger" onPress={() => onNavigate('client')} />
        {request ? <NavChip label="To pickup" onPress={() => onNavigate('pickup')} /> : null}
        {request ? <NavChip label="To drop-off" onPress={() => onNavigate('dropoff')} /> : null}
      </View>
    </View>
  );
}

function NavChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Navigate ${label.toLowerCase()}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: theme.colors.primary + '14',
      }}
    >
      <Navigation size={14} color={theme.colors.primary} />
      <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
