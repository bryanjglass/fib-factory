import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home'; code?: string }
  | { name: 'host'; code: string }
  | { name: 'tv'; code: string }
  | { name: 'play'; code: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const code = parts[1]?.toUpperCase().replace(/[^A-Z]/g, '');
  if (code && (parts[0] === 'host' || parts[0] === 'tv' || parts[0] === 'play')) {
    return { name: parts[0], code };
  }
  if (parts[0] === 'join' && code) return { name: 'home', code };
  return { name: 'home' };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
