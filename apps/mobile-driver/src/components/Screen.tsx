import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/tokens';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      style={{
        padding: theme.spacing.lg,
        paddingBottom: theme.spacing.lg + insets.bottom,
        gap: theme.spacing.lg,
        flex: scroll ? undefined : 1
      }}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.lg }}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
