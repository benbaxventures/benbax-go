import type { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import { theme } from '../theme/tokens';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg, flex: scroll ? undefined : 1 }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {scroll ? <ScrollView>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
