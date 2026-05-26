import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'benbax:privacy-settings';

export type PrivacySettings = {
  preciseLocation: boolean;
  maskedPhone: boolean;
  shareDeliveryHistory: boolean;
  safetyAlerts: boolean;
};

const defaultSettings: PrivacySettings = {
  preciseLocation: true,
  maskedPhone: true,
  shareDeliveryHistory: false,
  safetyAlerts: true
};

export function usePrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!mounted || !value) return;
        setSettings({ ...defaultSettings, ...(JSON.parse(value) as Partial<PrivacySettings>) });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function updateSetting(key: keyof PrivacySettings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return { settings, isLoading, updateSetting };
}
