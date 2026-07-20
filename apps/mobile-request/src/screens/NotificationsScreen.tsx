import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, BellOff, Car, CheckCheck, Package } from 'lucide-react-native';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  data?: { type?: string } | null;
  readAt: string | null;
  createdAt: string;
};

const ICON_FOR_TYPE = (type?: string) => {
  if (!type) return Bell;
  if (type.includes('ride')) return Car;
  if (type.includes('delivery')) return Package;
  return Bell;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => apiRequest('/notifications'),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <ArrowLeft size={24} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.ink, flex: 1 }}>
          Notifications
        </Text>
        {unreadCount > 0 && (
          <Pressable
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: theme.colors.primary + '15',
              borderRadius: theme.radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <CheckCheck size={15} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : isError ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}
        >
          <BellOff size={36} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
            Could not load notifications
          </Text>
          <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 13 }}>
            {error instanceof Error ? error.message : 'Please try again.'}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.md,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        >
          {notifications.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.lg,
                padding: 32,
                alignItems: 'center',
                gap: 10,
                marginTop: 40,
              }}
            >
              <Bell size={36} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
                No notifications yet
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
                Updates about your rides and deliveries will show up here.
              </Text>
            </View>
          ) : (
            notifications.map((item) => {
              const Icon = ICON_FOR_TYPE(item.data?.type);
              const isUnread = !item.readAt;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => isUnread && markRead.mutate(item.id)}
                  style={{
                    backgroundColor: isUnread ? theme.colors.primary + '0D' : theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    padding: 16,
                    flexDirection: 'row',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: isUnread ? theme.colors.primary + '33' : theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: theme.colors.primary + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        style={{
                          color: theme.colors.ink,
                          fontWeight: '900',
                          fontSize: 15,
                          flex: 1,
                        }}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {isUnread && (
                        <View
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 5,
                            backgroundColor: theme.colors.primary,
                          }}
                        />
                      )}
                    </View>
                    <Text
                      style={{ color: theme.colors.muted, fontSize: 13, lineHeight: 18 }}
                      numberOfLines={4}
                    >
                      {item.body}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 2 }}>
                      {relativeTime(item.createdAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
