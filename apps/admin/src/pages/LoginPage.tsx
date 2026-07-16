import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../services/api';
import { useAdminSession } from '../state/adminSession';

type Mode = 'login' | 'request-reset' | 'confirm-reset';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAdminSession((state) => state.login);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setResetCode('');
    setIsPasswordVisible(false);
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  async function submitResetRequest(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setNotice('A 6-digit reset code has been issued for this account.');
      setMode('confirm-reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request a reset code');
    } finally {
      setLoading(false);
    }
  }

  async function submitResetConfirm(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ phone, token: resetCode, newPassword: password }),
      });
      setNotice('Password updated. Sign in with your new password.');
      setMode('login');
      setPassword('');
      setResetCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  }

  const passwordInput = (label: string, autoComplete: string) => (
    <label>
      {label}
      <div className="password-field">
        <input
          value={password}
          type={isPasswordVisible ? 'text' : 'password'}
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

  return (
    <main className="login-page">
      {mode === 'login' ? (
        <form className="login-panel" onSubmit={submitLogin}>
          <div>
            <h1>Benbax Admin</h1>
            <p>Operations, dispatch, revenue, support, and safety management.</p>
          </div>
          <label>
            Phone
            <input
              value={phone}
              autoComplete="tel"
              required
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          {passwordInput('Password', 'current-password')}
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="form-notice">{notice}</p> : null}
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
            <p>Enter the phone number on your admin account to get a 6-digit reset code.</p>
          </div>
          <label>
            Phone
            <input
              value={phone}
              autoComplete="tel"
              required
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
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
            <p>Enter the 6-digit code for {phone} and choose a new password.</p>
          </div>
          <label>
            Reset code
            <input
              value={resetCode}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          {passwordInput('New password (min 8 characters)', 'new-password')}
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="form-notice">{notice}</p> : null}
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
