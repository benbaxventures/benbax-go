import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

type NavigationStep = {
  instruction: string;
  distance: string;
  maneuver?: string;
};

export function useVoiceNavigation() {
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const speak = useCallback(
    async (text: string) => {
      if (!voiceEnabled) return;
      try {
        const Speech = await import('expo-speech');
        const mod = Speech.default ?? Speech;
        if (typeof mod.speak === 'function') {
          mod.speak(text, {
            language: 'en-US',
            rate: 0.9,
            pitch: 1.0,
          });
        }
      } catch {
        // Speech not available
      }
    },
    [voiceEnabled]
  );

  const startNavigation = useCallback(
    async (_destinationLat: string, _destinationLng: string) => {
      setIsNavigating(true);
      setCurrentStepIndex(0);

      const fallbackSteps: NavigationStep[] = [
        { instruction: 'Head towards your destination', distance: 'Calculating route...' },
        { instruction: 'Continue straight', distance: 'Following route' },
        { instruction: 'Arrive at destination', distance: 'Almost there' },
      ];

      setSteps(fallbackSteps);
      speak('Navigation started. Head towards your destination.');
    },
    [speak]
  );

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      const next = currentStepIndex + 1;
      setCurrentStepIndex(next);
      const step = steps[next];
      if (step) speak(step.instruction);
    }
  }, [currentStepIndex, steps, speak]);

  const stopNavigation = useCallback(async () => {
    setIsNavigating(false);
    setSteps([]);
    setCurrentStepIndex(0);
    try {
      const mod = await import('expo-speech');
      const Speech = mod.default ?? mod;
      if (Speech && typeof Speech.stop === 'function') Speech.stop();
    } catch {}
  }, []);

  const toggleVoice = useCallback(async () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    await AsyncStorage.setItem('benbax.driver.voiceEnabled', String(next));
  }, [voiceEnabled]);

  const loadVoicePreference = useCallback(async () => {
    const stored = await AsyncStorage.getItem('benbax.driver.voiceEnabled');
    if (stored !== null) setVoiceEnabled(stored === 'true');
  }, []);

  return {
    steps,
    currentStepIndex,
    currentStep: steps[currentStepIndex] ?? null,
    isNavigating,
    voiceEnabled,
    startNavigation,
    nextStep,
    stopNavigation,
    toggleVoice,
    loadVoicePreference,
    speak,
  };
}
