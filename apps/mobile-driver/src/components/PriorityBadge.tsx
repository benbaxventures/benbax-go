import { Award, ChevronRight, Star, Zap } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type PriorityBreakdown = {
  score: number;
  level: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  factors: Array<{ label: string; points: number; positive: boolean }>;
};

type Props = {
  priority: PriorityBreakdown | null;
  onPress?: () => void;
};

const LEVEL_CONFIG = {
  Platinum: { color: '#8B5CF6', icon: Star, bg: '#8B5CF615' },
  Gold: { color: '#F59E0B', icon: Award, bg: '#F59E0B15' },
  Silver: { color: '#9CA3AF', icon: Award, bg: '#9CA3AF15' },
  Bronze: { color: '#D97706', icon: Zap, bg: '#D9770615' },
};

export function PriorityBadge({ priority, onPress }: Props) {
  if (!priority) return null;

  const config = LEVEL_CONFIG[priority.level];
  const Icon = config.icon;

  const content = (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: config.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} color={config.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 16 }}>
            {priority.score}
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>/100</Text>
        </View>
        <Text style={{ color: config.color, fontWeight: '800', fontSize: 13 }}>
          {priority.level} Level
        </Text>
      </View>
      {onPress && <ChevronRight size={20} color={theme.colors.muted} />}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}
