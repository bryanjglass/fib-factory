/** localStorage wrapper that never throws (private mode, blocked storage, etc). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const hostTokenKey = (code: string) => `fib.host.${code}`;
export const playerTokenKey = (code: string) => `fib.player.${code}`;
export const LAST_NAME_KEY = 'fib.lastName';
