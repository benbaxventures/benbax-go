import { useEffect, useRef } from 'react';
import * as Updates from 'expo-updates';

export function useOTAUpdates() {
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    (async () => {
      try {
        if (!Updates.isEnabled) return;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err) {
        console.warn('[OTA update]', err instanceof Error ? err.message : err);
      }
    })();
  }, []);
}
