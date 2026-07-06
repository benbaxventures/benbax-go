import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { theme } from '../theme/tokens';

type SkeletonBlockProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function SkeletonBlock({
  width = '100%' as string | number,
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonBlockProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          height,
          borderRadius,
          backgroundColor: theme.colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} height={14} style={{ marginBottom: i < lines - 1 ? 8 : 0 }} />
      ))}
    </>
  );
}

export function SkeletonLine({ width }: { width?: number | string }) {
  return <SkeletonBlock width={width ?? '100%'} height={14} style={{ marginBottom: 8 }} />;
}
