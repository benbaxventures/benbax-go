import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, WalletCards } from 'lucide-react-native';
import { Alert, Linking, Text, View } from 'react-native';
import { BonusTargetCard } from '../components/BonusTargetCard';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { Screen } from '../components/Screen';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type EarningsData = {
  today: { amount: number; tripCount: number };
  thisWeek: { amount: number; tripCount: number };
  thisMonth: { amount: number; tripCount: number };
  totalTrips: number;
  averageRating: number | null;
  acceptanceRate: number | null;
  completionRate: number | null;
};

type BonusGoal = {
  id: string;
  title: string;
  target: number;
  current: number;
  reward: number;
  type: 'weekly' | 'personal';
};

export function EarningsScreen() {
  const {
    data: earnings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<EarningsData>({
    queryKey: ['driver-earnings'],
    queryFn: () => apiRequest('/drivers/me/earnings'),
  });

  const { data: bonusGoals } = useQuery<BonusGoal[]>({
    queryKey: ['driver-bonuses'],
    queryFn: () => apiRequest('/drivers/me/bonuses'),
  });

  function handleWithdraw() {
    Alert.alert(
      'Withdraw to MoMo',
      'Withdrawals are processed via MTN Mobile Money. You will receive a prompt on your phone to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw now',
          onPress: () => {
            Linking.openURL('tel:*170#').catch(() =>
              Alert.alert(
                'Unable to initiate withdrawal',
                'Please dial *170# on your phone to access MTN MoMo and transfer from your Benbax wallet.'
              )
            );
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <SkeletonBlock width={140} height={28} />
        <SkeletonBlock height={120} borderRadius={10} />
        <SkeletonBlock height={160} borderRadius={10} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SkeletonBlock style={{ flex: 1 }} height={80} />
          <SkeletonBlock style={{ flex: 1 }} height={80} />
        </View>
        <SkeletonBlock height={160} borderRadius={10} />
        <SkeletonBlock height={52} borderRadius={8} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Earnings</Text>
        <OfflineBanner />
        <ErrorState
          title="Could not load earnings"
          message={
            error instanceof Error ? error.message : 'Please check your connection and try again.'
          }
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const todayAmount = earnings?.today?.amount ?? 0;
  const todayTrips = earnings?.today?.tripCount ?? 0;

  return (
    <Screen>
      <OfflineBanner />

      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Earnings</Text>

      {/* Today card */}
      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <WalletCards size={24} color="#fff" />
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Today</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>
          GHS {todayAmount.toFixed(2)}
        </Text>
        <Text style={{ color: '#D7FFF5' }}>
          {todayTrips} {todayTrips === 1 ? 'trip' : 'trips'} completed
        </Text>
      </View>

      {/* Bonus targets */}
      {bonusGoals && bonusGoals.length > 0 && <BonusTargetCard goals={bonusGoals} />}

      {/* Week / Month */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>WEEK</Text>
          <Text style={{ color: theme.colors.ink, fontSize: 18, fontWeight: '900' }}>
            GHS {earnings?.thisWeek?.amount.toFixed(2) ?? '0.00'}
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
            {earnings?.thisWeek?.tripCount ?? 0} trips
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>MONTH</Text>
          <Text style={{ color: theme.colors.ink, fontSize: 18, fontWeight: '900' }}>
            GHS {earnings?.thisMonth?.amount.toFixed(2) ?? '0.00'}
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
            {earnings?.thisMonth?.tripCount ?? 0} trips
          </Text>
        </View>
      </View>

      {/* Performance */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 8,
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={22} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Performance</Text>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.muted }}>Total trips</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
              {earnings?.totalTrips ?? 0}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.muted }}>Rating</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
              {earnings?.averageRating != null
                ? `${earnings.averageRating.toFixed(1)} / 5.0`
                : 'No ratings yet'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.muted }}>Acceptance rate</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
              {earnings?.acceptanceRate != null ? `${earnings.acceptanceRate}%` : '--'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.muted }}>Completion rate</Text>
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
              {earnings?.completionRate != null ? `${earnings.completionRate}%` : '--'}
            </Text>
          </View>
        </View>
      </View>

      <Button
        label="Withdraw to MoMo"
        icon={<DollarSign size={18} color="#fff" />}
        onPress={handleWithdraw}
      />
    </Screen>
  );
}
