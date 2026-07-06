import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Info, Sparkles } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type NewsItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  type: 'info' | 'warning' | 'update' | 'promotion';
};

const TYPE_CONFIG = {
  info: { color: '#2563EB', icon: Info, label: 'Info' },
  warning: { color: '#D97706', icon: AlertTriangle, label: 'Warning' },
  update: { color: '#0E7C66', icon: Sparkles, label: 'Update' },
  promotion: { color: '#8B5CF6', icon: Bell, label: 'Promo' },
};

export function NewsScreen() {
  const insets = useSafeAreaInsets();

  const {
    data: news,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<NewsItem[]>({
    queryKey: ['driver-news'],
    queryFn: () => apiRequest('/drivers/me/news'),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <SkeletonBlock height={28} width={120} />
        <SkeletonBlock height={80} borderRadius={12} />
        <SkeletonBlock height={80} borderRadius={12} />
        <SkeletonBlock height={80} borderRadius={12} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <ErrorState
          title="Could not load news"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
      >
        <OfflineBanner />

        <Text
          style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink, marginBottom: 16 }}
        >
          News & Updates
        </Text>

        {!news || news.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 24,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Bell size={32} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted }}>No news yet</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
              Platform updates and announcements will appear here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {news.map((item) => {
              const config = TYPE_CONFIG[item.type];
              const Icon = config.icon;
              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    gap: 8,
                    borderLeftWidth: 4,
                    borderLeftColor: config.color,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: config.color + '15',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={16} color={config.color} />
                    </View>
                    <View
                      style={{
                        backgroundColor: config.color + '15',
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: config.color, fontWeight: '700', fontSize: 10 }}>
                        {config.label}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.muted, fontSize: 11, marginLeft: 'auto' }}>
                      {new Date(item.createdAt).toLocaleDateString('en-GH', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
                    {item.title}
                  </Text>
                  <Text
                    style={{ color: theme.colors.muted, fontSize: 13, lineHeight: 18 }}
                    numberOfLines={3}
                  >
                    {item.body}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
