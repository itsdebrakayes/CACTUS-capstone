import { useCallback, useLayoutEffect, useRef } from "react";

export function usePersistFn<T extends (...args: never[]) => unknown>(fn: T): T {
  const fnRef = useRef(fn);

  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  return useCallback(((...args) => fnRef.current(...args)) as T, []);
}