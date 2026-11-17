/**
 * Where is the multiplayer backend?
 *
 * 1. `?server=https://…` on the page URL (remembered in localStorage) — handy for testing.
 * 2. `VITE_SERVER_URL` at build time — the normal production setting (your Worker URL).
 * 3. Same origin as the page — used in local dev, where Vite proxies /api to `wrangler dev`.
 */
import { storage } from './lib/storage';

function resolveServer(): { url: string; fromQuery: boolean } {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('server');
  if (fromQuery) {
    storage.set('fib.server', fromQuery);
    return { url: fromQuery, fromQuery: true };
  }
  const remembered = storage.get('fib.server');
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  return { url: remembered || fromEnv || window.location.origin, fromQuery: false };
}

const resolved = resolveServer();

export const SERVER_HTTP = resolved.url.replace(/\/+$/, '');
export const SERVER_WS = SERVER_HTTP.replace(/^http/i, 'ws');

/** Base URL of this web app (works under any GitHub Pages sub-path). */
export function appBaseUrl(): string {
  const { origin, pathname, search } = window.location;
  const params = new URLSearchParams(search);
  // Only carry the server override along if it came from the URL.
  const keep = params.get('server') ? `?server=${encodeURIComponent(params.get('server')!)}` : '';
  return `${origin}${pathname}${keep}`;
}

export function joinUrl(code: string): string {
  return `${appBaseUrl()}#/play/${code}`;
}

export function tvUrl(code: string): string {
  return `${appBaseUrl()}#/tv/${code}`;
}

/** Short, human-typeable version of the site address for the TV. */
export function shortSiteLabel(): string {
  const { host, pathname } = window.location;
  return `${host}${pathname.replace(/\/(index\.html)?$/, '')}`;
}
