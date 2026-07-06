import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type PriorityFactor = {
  label: string;
  points: number;
  positive: boolean;
};

type PriorityData = {
  score: number;
  level: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  factors: PriorityFactor[];
  nextResetDate: string;
};

const LEVEL_CONFIG = {
  Platinum: { color: '#8B5CF6', bg: '#8B5CF615', minScore: 80 },
  Gold: { color: '#F59E0B', bg: '#F59E0B15', minScore: 60 },
  Silver: { color: '#9CA3AF', bg: '#9CA3AF15', minScore: 40 },
  Bronze: { color: '#D97706', bg: '#D9770615', minScore: 0 },
};

export function PriorityDetailsScreen() {
  const insets = useSafeAreaInsets();

  const {
    data: priority,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PriorityData>({
    queryKey: ['driver-priority'],
    queryFn: () => apiRequest('/drivers/me/priority'),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <SkeletonBlock height={28} width={120} />
        <SkeletonBlock height={160} borderRadius={12} />
        <SkeletonBlock height={200} borderRadius={12} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <ErrorState
          title="Could not load priority"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const level = priority?.level ?? 'Bronze';
  const config = LEVEL_CONFIG[level];
  const score = priority?.score ?? 0;

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
          Priority Level
        </Text>

        {/* Score card */}
        <View
          style={{
            backgroundColor: config.bg,
            borderRadius: 16,
            padding: 24,
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: config.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>{score}</Text>
          </View>
          <Text style={{ color: config.color, fontWeight: '900', fontSize: 20 }}>{level}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
            Higher priority means more trip requests and better earning opportunities.
          </Text>
        </View>

        {/* Level thresholds */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            Level Thresholds
          </Text>
          {Object.entries(LEVEL_CONFIG).map(([name, cfg]) => (
            <View
              key={name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 6,
                opacity: score >= cfg.minScore ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: cfg.color,
                }}
              />
              <Text style={{ flex: 1, color: theme.colors.ink, fontWeight: '700' }}>{name}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{cfg.minScore}+ pts</Text>
              {name === level && (
                <View
                  style={{
                    backgroundColor: cfg.color + '20',
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 11 }}>CURRENT</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* How to earn */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 10,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Info size={18} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
              How to earn priority
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {[
              { icon: '🚗', text: 'Brand your vehicle or use a lightbox', points: '+10' },
              { icon: '⭐', text: 'Maintain a high passenger rating', points: '+5/week' },
              { icon: '🏆', text: 'Earn a higher tier in rewards', points: '+5' },
              { icon: '🗺️', text: 'Use Pathfinder (heading home)', points: '+3' },
              { icon: '📅', text: 'Complete orders consistently', points: '+4/week' },
            ].map((item, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                <Text style={{ flex: 1, color: theme.colors.ink, fontSize: 13 }}>{item.text}</Text>
                <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                  {item.points}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Current factors */}
        {priority?.factors && priority.factors.length > 0 && (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
              Your Activity
            </Text>
            {priority.factors.map((factor, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: theme.colors.ink, fontSize: 13 }}>{factor.label}</Text>
                <Text
                  style={{
                    color: factor.positive ? theme.colors.primary : theme.colors.danger,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {factor.positive ? '+' : ''}
                  {factor.points}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
