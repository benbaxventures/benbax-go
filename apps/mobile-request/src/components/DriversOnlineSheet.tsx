import { Bike, Car, MapPin, Navigation, Star, X } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDriverDistance,
  pickupEtaMinutes,
  type NearbyDriver,
} from '../hooks/useNearbyDrivers';
import { theme } from '../theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * The same live driver records the map markers are drawn from — already
   * sorted nearest-first and distanced against the pickup point. This sheet
   * never opens its own subscription.
   */
  drivers: NearbyDriver[];
  /** True while the realtime stream is connected; false means the list may lag. */
  live: boolean;
  /** Centre the map on every driver. */
  onShowOnMap: () => void;
  /** Focus the map on one driver. */
  onFocusDriver?: (driver: NearbyDriver) => void;
};

/** The app's one distance format, with the "away" suffix this list reads better with. */
function formatDistance(km: number): string {
  const measured = formatDriverDistance(km);
  return measured ? `${measured} away` : 'Distance unknown';
}

function vehicleLabel(vehicleType?: string | null): string {
  if (!vehicleType) return 'Vehicle';
  const normalized = vehicleType.trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isTwoWheeler(vehicleType?: string | null) {
  return /moto|bike|bicycle|okada/i.test(vehicleType ?? '');
}

/** "online 12 min ago" → how long this driver has been available. */
function onlineFor(since?: string): string | null {
  if (!since) return null;
  const started = Date.parse(since);
  if (!Number.isFinite(started)) return null;
  const minutes = Math.floor((Date.now() - started) / 60_000);
  if (minutes < 1) return 'just came online';
  if (minutes < 60) return `online ${minutes} min`;
  return `online ${Math.floor(minutes / 60)} h`;
}

const DriverRow = memo(function DriverRow({
  driver,
  onPress,
}: {
  driver: NearbyDriver;
  onPress?: (driver: NearbyDriver) => void;
}) {
  const eta = pickupEtaMinutes(driver.distanceKm);
  const available = driver.available !== false;
  const twoWheeler = isTwoWheeler(driver.vehicleType);
  const duration = onlineFor(driver.since);

  return (
    <Pressable
      onPress={onPress ? () => onPress(driver) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={
        `${vehicleLabel(driver.vehicleType)} driver, ${formatDistance(driver.distanceKm)}` +
        `${eta != null ? `, about ${eta} minutes away` : ''}` +
        `, ${available ? 'available' : 'currently on a trip'}`
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: available ? theme.colors.info + '18' : theme.colors.surfaceMuted,
        }}
      >
        {twoWheeler ? (
          <Bike size={20} color={available ? theme.colors.info : theme.colors.muted} />
        ) : (
          <Car size={20} color={available ? theme.colors.info : theme.colors.muted} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}
            numberOfLines={1}
          >
            {vehicleLabel(driver.vehicleType)}
            {driver.name ? ` · ${driver.name}` : ''}
          </Text>
          {driver.rating != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Star size={11} color={theme.colors.accent} fill={theme.colors.accent} />
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '700' }}>
                {driver.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={{ color: theme.colors.muted, fontSize: 12 }} numberOfLines={1}>
          {formatDistance(driver.distanceKm)}
          {eta != null ? ` · ~${eta} min to you` : ''}
          {duration ? ` · ${duration}` : ''}
        </Text>

        {driver.vehicleDescription ? (
          <Text style={{ color: theme.colors.muted, fontSize: 11 }} numberOfLines={1}>
            {driver.vehicleDescription}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: available ? theme.colors.success + '18' : theme.colors.accent + '22',
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: available ? theme.colors.success : theme.colors.accent,
            }}
          />
          <Text
            style={{
              color: available ? theme.colors.success : '#B45309',
              fontSize: 11,
              fontWeight: '800',
            }}
          >
            {available ? 'Available' : 'On a trip'}
          </Text>
        </View>
        {onPress ? <MapPin size={14} color={theme.colors.muted} /> : null}
      </View>
    </Pressable>
  );
});

/**
 * The driver-discovery sheet behind the "N drivers online" pill: every driver
 * whose app is connected right now, nearest first, with the detail a passenger
 * needs before booking.
 *
 * Purely presentational — it renders the array the booking screen already keeps
 * in sync over the realtime stream, so opening and closing it repeatedly costs
 * no extra sockets, queries or listeners.
 */
export function DriversOnlineSheet({
  visible,
  onClose,
  drivers,
  live,
  onShowOnMap,
  onFocusDriver,
}: Props) {
  const insets = useSafeAreaInsets();

  const { available, nearest } = useMemo(
    () => ({
      available: drivers.filter((driver) => driver.available !== false).length,
      nearest: drivers[0]?.distanceKm,
    }),
    [drivers]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the driver list"
        style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' }}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '78%',
          backgroundColor: theme.colors.canvas,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {/* Grabber */}
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.border,
            marginTop: 10,
            marginBottom: 6,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 18 }}>
              {drivers.length === 0
                ? 'No drivers available nearby'
                : `${drivers.length} ${drivers.length === 1 ? 'driver' : 'drivers'} online`}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {drivers.length === 0
                ? live
                  ? 'We’ll show them here the moment one comes online.'
                  : 'Reconnecting to the live driver feed…'
                : `${available} available now${
                    nearest != null ? ` · nearest ${formatDistance(nearest)}` : ''
                  }`}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={{ padding: 6 }}
          >
            <X size={22} color={theme.colors.muted} />
          </Pressable>
        </View>

        {drivers.length > 0 ? (
          <Pressable
            onPress={() => {
              onShowOnMap();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Show every online driver on the map"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginHorizontal: 16,
              marginBottom: 10,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: pressed ? theme.colors.primaryDark : theme.colors.primary,
            })}
          >
            <Navigation size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Show all on map</Text>
          </Pressable>
        ) : null}

        <FlatList
          data={drivers}
          keyExtractor={(driver) => driver.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}
          // Long lists stay smooth without re-rendering every row on each
          // position update.
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <DriverRow
              driver={item}
              {...(onFocusDriver
                ? {
                    onPress: (driver: NearbyDriver) => {
                      onFocusDriver(driver);
                      onClose();
                    },
                  }
                : {})}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
              <Car size={30} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
                No drivers available nearby
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12, textAlign: 'center' }}>
                You can still request a ride — the first driver to come online will see it.
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}
