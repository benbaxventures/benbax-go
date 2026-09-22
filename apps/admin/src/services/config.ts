/**
 * Where this dashboard talks to the API.
 *
 * REST goes through a same-origin path by default. On Vercel `/api/*` is
 * rewritten to the API host (see vercel.json) and in dev the Vite server
 * proxies the same path (see vite.config.ts), so the shipped bundle contains
 * no host at all and can never be left pointing at a localhost API that isn't
 * running — the failure this default exists to prevent.
 *
 * Sockets cannot use that path: platform rewrites do not carry a WebSocket
 * upgrade, so the realtime client connects to the API origin directly. That
 * origin is allow-listed for CORS in apps/api/src/config/env.ts.
 *
 * Every value is overridable at build time for anyone pointing the dashboard
 * somewhere else (a locally running API, a staging host).
 */

import { DEFAULT_API_ORIGIN } from './apiOrigin';

export { DEFAULT_API_ORIGIN };

function fromEnv(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : null;
}

/** Origin of the API host itself, with no path. */
export const API_ORIGIN = fromEnv(import.meta.env.VITE_API_ORIGIN) ?? DEFAULT_API_ORIGIN;

/** Base for every REST call — relative unless explicitly overridden. */
export const API_BASE_URL = fromEnv(import.meta.env.VITE_API_BASE_URL) ?? '/api/v1';

/** Socket.IO endpoint. Always absolute; a relative path cannot be upgraded. */
export const SOCKET_URL = fromEnv(import.meta.env.VITE_SOCKET_URL) ?? API_ORIGIN;

/** Absolute URL of a REST path, for error messages that must name a host. */
export function describeApiUrl(path: string): string {
  if (/^https?:\/\//.test(API_BASE_URL)) return `${API_BASE_URL}${path}`;
  return `${window.location.origin}${API_BASE_URL}${path}`;
}
