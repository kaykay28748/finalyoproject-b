import { useEffect, useRef } from "react";
import { recordPing, startPinger, stopPinger } from "../services/gpsPings";

const POLL_INTERVAL_MS = 3000;

export function useGpsPings(currentLocation, isAccurate = true) {
  const lastSampleRef = useRef(0);
  const locationRef = useRef(currentLocation);
  locationRef.current = currentLocation;
  const isAccurateRef = useRef(isAccurate);
  isAccurateRef.current = isAccurate;

  useEffect(() => {
    startPinger();

    const pollId = setInterval(() => {
      if (document.hidden) return;

      const loc = locationRef.current;
      if (!loc?.lat || !loc?.lng) return;

      // Skip coarse Wi-Fi/IP fixes (typical on desktop) — they would scatter
      // the heatmap with pings from wherever the ISP resolves to.
      if (!isAccurateRef.current) return;

      const now = Date.now();
      if (now - lastSampleRef.current < POLL_INTERVAL_MS) return;
      lastSampleRef.current = now;

      recordPing(loc.lat, loc.lng);
    }, 1000);

    const onVisibility = () => {
      if (document.hidden) {
        stopPinger();
      } else {
        startPinger();
        lastSampleRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
      stopPinger();
    };
  }, []);
}
