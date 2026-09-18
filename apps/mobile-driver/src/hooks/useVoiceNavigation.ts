import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters, type RouteCoordinate, type RouteStep } from '../services/directions';

type NavigationStep = {
  instruction: string;
  distance: string;
  maneuver?: string;
  /** Where this manoeuvre ends; present for real Directions API steps. */
  end?: RouteCoordinate;
};

/** Advance to the next instruction once the driver is this close to a step's end. */
const STEP_REACHED_METERS = 30;

export function useVoiceNavigation() {
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const stepsRef = useRef<NavigationStep[]>([]);
  const indexRef = useRef(0);
  stepsRef.current = steps;
  indexRef.current = currentStepIndex;

  useEffect(() => {
    AsyncStorage.getItem('benbax.driver.voiceEnabled')
      .then((stored) => {
        if (stored !== null) setVoiceEnabled(stored === 'true');
      })
      .catch(() => undefined);
  }, []);

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

  /**
   * Starts spoken guidance. Pass the Directions API `routeSteps` for real
   * turn-by-turn prompts (advanced by `updatePosition`); without them a generic
   * head-to-destination prompt is used.
   */
  const startNavigation = useCallback(
    async (_destinationLat: string, _destinationLng: string, routeSteps?: RouteStep[]) => {
      setIsNavigating(true);
      setCurrentStepIndex(0);

      if (routeSteps && routeSteps.length > 0) {
        const real: NavigationStep[] = routeSteps.map((s) => ({
          instruction: s.instruction,
          distance: s.distanceText,
          end: s.end,
          ...(s.maneuver ? { maneuver: s.maneuver } : {}),
        }));
        setSteps(real);
        speak(`Navigation started. ${real[0]!.instruction}`);
        return;
      }

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

  /** Feed live GPS fixes: announces the next turn as each step is completed. */
  const updatePosition = useCallback(
    (position: RouteCoordinate) => {
      const list = stepsRef.current;
      let index = indexRef.current;
      const current = list[index];
      if (!current?.end) return;
      if (haversineMeters(position, current.end) > STEP_REACHED_METERS) return;
      index += 1;
      const next = list[index];
      if (!next) {
        speak('You have arrived at your destination.');
        return;
      }
      indexRef.current = index;
      setCurrentStepIndex(index);
      speak(next.distance ? `In ${next.distance}, ${next.instruction}` : next.instruction);
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
    updatePosition,
    nextStep,
    stopNavigation,
    toggleVoice,
    loadVoicePreference,
    speak,
  };
}
