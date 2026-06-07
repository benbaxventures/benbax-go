import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'benbax:privacy-settings';
const BIOMETRIC_KEY = 'benbax:biometric-lock';

export type PrivacySettings = {
  preciseLocation: boolean;
  maskedPhone: boolean;
  shareDeliveryHistory: boolean;
  safetyAlerts: boolean;
  biometricLock: boolean;
};

const defaultSettings: PrivacySettings = {
  preciseLocation: true,
  maskedPhone: true,
  shareDeliveryHistory: false,
  safetyAlerts: true,
  biometricLock: false,
};

export function usePrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [stored, biometricPref] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        SecureStore.getItemAsync(BIOMETRIC_KEY).catch(() => null),
      ]);

      if (!mounted) return;

      let parsed: Partial<PrivacySettings> = {};
      try {
        parsed = stored ? JSON.parse(stored) : {};
      } catch {
        parsed = {};
      }
      if (biometricPref !== null) {
        parsed.biometricLock = biometricPref === 'true';
      }

      setSettings({ ...defaultSettings, ...parsed });
      setIsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function updateSetting(key: keyof PrivacySettings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);

    if (key === 'biometricLock') {
      await SecureStore.setItemAsync(BIOMETRIC_KEY, value ? 'true' : 'false').catch(() => {});
    }

    const toStore: Omit<PrivacySettings, 'biometricLock'> &
      Partial<Pick<PrivacySettings, 'biometricLock'>> = { ...next };
    delete toStore.biometricLock;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  }

  return { settings, isLoading, updateSetting };
}
