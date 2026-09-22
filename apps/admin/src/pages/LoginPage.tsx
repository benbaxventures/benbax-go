import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ApiRequestError,
  ApiUnreachableError,
  apiRequest,
  describeApiError,
} from '../services/api';
import { useAdminSession } from '../state/adminSession';

type Mode = 'login' | 'request-reset' | 'confirm-reset';

/**
 * How long a request may run before we explain the wait. The API sleeps when
 * idle and its first request can take the better part of a minute, which looks
 * like a hang unless it's named.
 */
const COLD_START_HINT_MS = 6000;

/** What to put on screen for a thrown error, plus an optional next step. */
function describeError(err: unknown): { message: string; hint?: string } {
  if (err instanceof ApiUnreachableError) {
    return {
      message: err.message,
      hint: 'The dashboard could not reach the server at all. If this keeps happening the API may be asleep — wait a few seconds and try again.',
    };
  }
  // Sign-in has its own reading of a 401: the credentials were wrong, not that
  // a session lapsed. Everything else goes through the shared classifier.
  if (err instanceof ApiRequestError && err.status === 401) {
    return { message: 'Invalid email/phone or password.' };
  }
  if (err instanceof ApiRequestError && err.status === 429) {
    return {
      message: describeApiError(err),
      hint: 'Sign-in attempts are limited to protect accounts from guessing.',
    };
  }
  return { message: describeApiError(err) };
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const login = useAdminSession((state) => state.login);

  // Explain a long wait rather than leaving the operator on a dead-looking
  // button while the API wakes up.
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), COLD_START_HINT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setResetCode('');
    setIsPasswordVisible(false);
  }

  /** Runs a submit handler with shared loading/error plumbing. */
  function submitting(action: () => Promise<void>) {
    return async (event: React.FormEvent) => {
      event.preventDefault();
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    };
  }

  const submitLogin = submitting(async () => {
    await login(identifier, password);
  });

  const submitResetRequest = submitting(async () => {
    await apiRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim() }),
    });
    setNotice('A 6-digit reset code has been sent to this account.');
    setMode('confirm-reset');
  });

  const submitResetConfirm = submitting(async () => {
    await apiRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        identifier: identifier.trim(),
        token: resetCode,
        newPassword: password,
      }),
    });
    setNotice('Password updated. Sign in with your new password.');
    setMode('login');
    setPassword('');
    setResetCode('');
  });

  const identifierInput = (label: string) => (
    <label>
      {label}
      <input
        value={identifier}
        autoComplete="username"
        placeholder="e.g. benbaxventures@gmail.com or 059 417 2522"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        onChange={(event) => setIdentifier(event.target.value)}
        onBlur={(event) => setIdentifier(event.target.value.trim())}
      />
    </label>
  );

  const passwordInput = (label: string, autoComplete: string) => (
    <label>
      {label}
      <div className="password-field">
        <input
          value={password}
          type={isPasswordVisible ? 'text' : 'password'}
          placeholder={label}
          autoComplete={autoComplete}
          minLength={8}
          required
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
          onClick={() => setIsPasswordVisible((visible) => !visible)}
        >
          {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );

  const feedback = (
    <>
      {error ? (
        <p className="form-error" role="alert">
          {error.message}
          {error.hint ? <span className="form-error-hint">{error.hint}</span> : null}
        </p>
      ) : null}
      {notice ? (
        <p className="form-notice" role="status">
          {notice}
        </p>
      ) : null}
      {slow ? (
        <p className="form-notice" role="status">
          Waking the Benbax server — the first request after a quiet spell can take up to a minute.
        </p>
      ) : null}
    </>
  );

  return (
    <main className="login-page">
      {mode === 'login' ? (
        <form className="login-panel" onSubmit={submitLogin}>
          <div>
            <h1>Benbax Admin</h1>
            <p>Operations, dispatch, revenue, support, and safety management.</p>
          </div>
          {identifierInput('Phone or email')}
          {passwordInput('Password', 'current-password')}
          {feedback}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <button type="button" className="link-button" onClick={() => switchMode('request-reset')}>
            Forgotten password?
          </button>
        </form>
      ) : mode === 'request-reset' ? (
        <form className="login-panel" onSubmit={submitResetRequest}>
          <div>
            <h1>Reset password</h1>
            <p>
              Enter the phone number or email on your admin account to get a 6-digit reset code.
            </p>
          </div>
          {identifierInput('Phone or email')}
          {feedback}
          <button type="submit" disabled={loading}>
            {loading ? 'Requesting...' : 'Send reset code'}
          </button>
          <button type="button" className="link-button" onClick={() => switchMode('login')}>
            Back to sign in
          </button>
        </form>
      ) : (
        <form className="login-panel" onSubmit={submitResetConfirm}>
          <div>
            <h1>Enter reset code</h1>
            <p>Enter the 6-digit code for {identifier} and choose a new password.</p>
          </div>
          <label>
            Reset code
            <input
              value={resetCode}
              placeholder="6-digit code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          {passwordInput('New password (min 8 characters)', 'new-password')}
          {feedback}
          <button type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Set new password'}
          </button>
          <button type="button" className="link-button" onClick={() => switchMode('request-reset')}>
            Request a new code
          </button>
        </form>
      )}
    </main>
  );
}
