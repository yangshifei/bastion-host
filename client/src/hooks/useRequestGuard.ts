import { useRef, useCallback } from 'react';

/**
 * Ignore out-of-order async list responses (e.g. rapid filter / pagination changes).
 */
export function useRequestGuard() {
  const seqRef = useRef(0);

  const begin = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const isLatest = useCallback((seq: number) => seq === seqRef.current, []);

  return { begin, isLatest };
}
