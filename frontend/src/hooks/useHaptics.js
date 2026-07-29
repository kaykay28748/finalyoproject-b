import { useCallback } from 'react';

export function useHaptics() {
  const trigger = useCallback((pattern) => {
    try {
      window.navigator?.vibrate?.(pattern);
    } catch {}
  }, []);

  return { trigger };
}
