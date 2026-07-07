import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

let isEnabled = false;

/**
 * Initializes Sentry crash/error reporting. Safe to call unconditionally: if no
 * DSN is configured (e.g. local dev), reporting stays disabled and every helper
 * below becomes a no-op instead of throwing.
 */
export function initSentry(): void {
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      // Distinguish preview vs production builds in the Sentry dashboard.
      environment: (Constants.expoConfig?.extra?.releaseChannel as string) ?? 'production',
      // Ship a sane amount of performance data without overwhelming quota.
      tracesSampleRate: 0.2,
      // Native crashes + JS errors; leave verbose debug off in shipped builds.
      enableNativeCrashHandling: true,
    });
    isEnabled = true;
  } catch (err) {
    // A malformed DSN must never prevent the app from starting.
    console.warn('[sentry] Failed to initialize crash reporting:', err);
  }
}

/** Reports a handled error (e.g. from an ErrorBoundary) to Sentry. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!isEnabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Associates the current authenticated driver with subsequent Sentry events. */
export function setSentryUser(user: { id: string; phone?: string } | null): void {
  if (!isEnabled) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser(user.phone ? { id: user.id, username: user.phone } : { id: user.id });
}

/** Wraps the root component so Sentry can capture render errors and touch events. */
export const wrapWithSentry = Sentry.wrap;
