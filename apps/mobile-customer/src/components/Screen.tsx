import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/tokens';

type Props = PropsWithChildren<{
  scroll?: boolean;
}>;

export function Screen({ children, scroll = true }: Props) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(theme.spacing.lg, insets.bottom + theme.spacing.md);

  const content = (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom, flex: scroll ? undefined : 1 }}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: paddingBottom }}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
