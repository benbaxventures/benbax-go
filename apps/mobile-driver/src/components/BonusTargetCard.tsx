import { Target, Trophy } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type BonusGoal = {
  id: string;
  title: string;
  target: number;
  current: number;
  reward: number;
  type: 'weekly' | 'personal';
};

type Props = {
  goals: BonusGoal[];
};

export function BonusTargetCard({ goals }: Props) {
  if (!goals.length) return null;

  const weeklyGoal = goals.find((g) => g.type === 'weekly');
  const personalGoals = goals.filter((g) => g.type === 'personal');

  return (
    <View style={{ gap: 10 }}>
      {weeklyGoal && (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 10,
            borderLeftWidth: 4,
            borderLeftColor: theme.colors.accent,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Target size={20} color={theme.colors.accent} />
            <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
              Weekly Goal
            </Text>
          </View>
          <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{weeklyGoal.title}</Text>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.min((weeklyGoal.current / weeklyGoal.target) * 100, 100)}%`,
                height: '100%',
                backgroundColor:
                  weeklyGoal.current >= weeklyGoal.target
                    ? theme.colors.primary
                    : theme.colors.accent,
                borderRadius: 4,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {weeklyGoal.current} / {weeklyGoal.target}
            </Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
              Bonus: GHS {weeklyGoal.reward.toFixed(2)}
            </Text>
          </View>
          {weeklyGoal.current >= weeklyGoal.target && (
            <View
              style={{
                backgroundColor: theme.colors.primary + '15',
                borderRadius: 8,
                padding: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Trophy size={16} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 13 }}>
                Goal achieved! Claim your bonus.
              </Text>
            </View>
          )}
        </View>
      )}

      {personalGoals.length > 0 && (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 14 }}>
            Personal Goals
          </Text>
          {personalGoals.map((goal) => (
            <View key={goal.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 13 }}>
                  {goal.title}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  {goal.current}/{goal.target}
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.min((goal.current / goal.target) * 100, 100)}%`,
                    height: '100%',
                    backgroundColor: theme.colors.primary,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '700' }}>
                +GHS {goal.reward.toFixed(2)} reward
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
