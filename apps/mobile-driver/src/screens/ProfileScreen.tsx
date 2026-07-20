import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Calendar,
  Car,
  ChevronRight,
  Headphones,
  LogOut,
  MapPin,
  MessageSquareText,
  Phone,
  Shield,
} from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DistanceSlider } from '../components/DistanceSlider';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { BENBAX_PHONE, callPhone, openWhatsApp } from '../services/contact';
import { useAuthStore } from '../store/authStore';
import { useDriverStore } from '../store/driverStore';
import { theme } from '../theme/tokens';

const SERVICE_CLASSES = [
  {
    key: 'economy' as const,
    label: 'Economy',
    desc: 'Most requests, standard fares',
    color: theme.colors.primary,
  },
  {
    key: 'comfort' as const,
    label: 'Comfort',
    desc: 'Higher fares, fewer requests',
    color: '#2563EB',
  },
  {
    key: 'premium' as const,
    label: 'Premium',
    desc: 'Best fares, exclusive trips',
    color: '#8B5CF6',
  },
];

export function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {
    maxPickupDistance,
    setMaxPickupDistance,
    serviceClass,
    setServiceClass,
    newsUnreadCount,
  } = useDriverStore();

  // Poll the in-app notification feed so the badge stays current.
  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread'],
    queryFn: () => apiRequest('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const notificationsUnread = unread?.count ?? 0;

  function handleSafetyCenter() {
    Alert.alert('Safety Center', 'Your safety is our priority. Here are important resources:', [
      {
        text: 'Share trip status',
        onPress: () => {
          const message = `I am currently on a Benbax trip. Track my live location: https://benbax.com/live`;
          openWhatsApp(BENBAX_PHONE, message);
        },
      },
      {
        text: 'Emergency contact',
        onPress: () => callPhone(BENBAX_PHONE),
      },
      {
        text: 'Safety tips',
        onPress: () =>
          Alert.alert(
            'Safety Tips',
            '• Always verify passenger identity before starting a trip\n• Share your live trip status with emergency contacts\n• Park in well-lit areas during night pickups\n• Report any suspicious behaviour immediately\n• Keep your emergency contacts updated'
          ),
      },
      { text: 'Close', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Profile</Text>

      {/* User info */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 8,
          padding: 16,
          gap: 6,
        }}
      >
        <Text style={{ color: theme.colors.ink, fontSize: 20, fontWeight: '900' }}>
          {user?.name}
        </Text>
        <Text style={{ color: theme.colors.muted }}>{user?.phone}</Text>
      </View>

      {/* Service class */}
      <View
        style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Car size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            Ride Class
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          {SERVICE_CLASSES.map((cls) => (
            <Pressable
              key={cls.key}
              onPress={() => setServiceClass(cls.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: serviceClass === cls.key ? cls.color : theme.colors.border,
                backgroundColor: serviceClass === cls.key ? cls.color + '10' : 'transparent',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: serviceClass === cls.key ? cls.color : theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {serviceClass === cls.key && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: cls.color,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>{cls.label}</Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{cls.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Pickup radius */}
      <View
        style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            Pickup Preferences
          </Text>
        </View>
        <DistanceSlider
          value={maxPickupDistance}
          onValueChange={setMaxPickupDistance}
          minimumValue={1}
          maximumValue={25}
          step={1}
        />
      </View>

      {/* Quick links */}
      <View style={{ gap: 8 }}>
        <Pressable
          onPress={() => navigation.navigate('ShiftSchedule')}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: theme.colors.primary + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calendar size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>Shift Schedule</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Set your driving hours</Text>
          </View>
          <ChevronRight size={18} color={theme.colors.muted} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: theme.colors.primary + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BellRing size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>Notifications</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Requests, offers & order updates
            </Text>
          </View>
          {notificationsUnread > 0 && (
            <View
              style={{
                backgroundColor: theme.colors.danger,
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                {notificationsUnread > 99 ? '99+' : notificationsUnread}
              </Text>
            </View>
          )}
          <ChevronRight size={18} color={theme.colors.muted} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('News')}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: '#2563EB15',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bell size={18} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>News & Updates</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Platform announcements</Text>
          </View>
          {newsUnreadCount > 0 && (
            <View
              style={{
                backgroundColor: theme.colors.danger,
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                {newsUnreadCount}
              </Text>
            </View>
          )}
          <ChevronRight size={18} color={theme.colors.muted} />
        </Pressable>
      </View>

      {/* Support */}
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Headphones size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Benbax Support</Text>
        </View>
        <Text style={{ color: theme.colors.muted }}>Contact us via call or WhatsApp.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Call"
              icon={<Phone size={18} color="#fff" />}
              onPress={() => callPhone(BENBAX_PHONE)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="WhatsApp"
              icon={<MessageSquareText size={18} color="#fff" />}
              onPress={() => openWhatsApp(BENBAX_PHONE)}
            />
          </View>
        </View>
      </View>

      <Button
        label="Safety center"
        icon={<Shield size={18} color="#fff" />}
        onPress={handleSafetyCenter}
      />

      <Button
        label="Sign out"
        icon={<LogOut size={18} color="#fff" />}
        onPress={logout}
        variant="danger"
      />
    </Screen>
  );
}
