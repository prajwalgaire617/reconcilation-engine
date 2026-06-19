import { useEffect, useRef } from "react";

export function useAutoRefresh(callback, intervalMs = 15000, enabled = true) {
  const savedCb = useRef(callback);
  useEffect(() => { savedCb.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => savedCb.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
