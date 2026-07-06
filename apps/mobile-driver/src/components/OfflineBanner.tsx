import { WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { checkApiHealth } from '../services/api';
import { theme } from '../theme/tokens';

type OfflineBannerProps = {
  checkIntervalMs?: number;
};

export function OfflineBanner({ checkIntervalMs = 15000 }: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const healthy = await checkApiHealth();
      if (!mounted) return;
      setIsOffline(!healthy);
      if (!healthy) {
        setShow(true);
      } else {
        // Delay hiding so the user sees the banner briefly during reconnection
        setTimeout(() => {
          if (mounted) setShow(false);
        }, 2000);
      }
    }

    // Initial check
    check();

    const interval = setInterval(check, checkIntervalMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [checkIntervalMs]);

  if (!show) return null;

  return (
    <View
      style={{
        backgroundColor: isOffline ? theme.colors.danger : theme.colors.primary,
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <WifiOff size={16} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
        {isOffline ? 'No connection to server — some features may not work' : 'Back online'}
      </Text>
    </View>
  );
}
