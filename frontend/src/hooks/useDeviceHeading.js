// hooks/useDeviceHeading.js
import { useState, useEffect, useCallback, useRef } from "react";

export function useDeviceHeading() {
  const [heading, setHeading] = useState(null);
  const [permissionState, setPermissionState] = useState("unknown");
  const headingRef = useRef(null);
  const lastUpdateRef = useRef(0);

  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === "undefined") {
      setPermissionState("unsupported");
      return false;
    }

    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result === "granted") {
          setPermissionState("granted");
          return true;
        }
        setPermissionState("denied");
        return false;
      } catch {
        setPermissionState("denied");
        return false;
      }
    }

    // Non-iOS or older iOS — permission not needed
    setPermissionState("granted");
    return true;
  }, []);

  useEffect(() => {
    let isActive = true;

    const handleOrientation = (e) => {
      if (!isActive) return;

      // Throttle to ~15fps to reduce jitter
      const now = performance.now();
      if (now - lastUpdateRef.current < 66) return;
      lastUpdateRef.current = now;

      let newHeading = null;

      // iOS provides webkitCompassHeading (0 = north, clockwise)
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        newHeading = e.webkitCompassHeading;
      }
      // Android / standard: alpha is the rotation around z-axis (0-360)
      // But alpha is relative, so we need the absolute orientation event
      else if (e.alpha !== null && e.alpha !== undefined) {
        // On Android, use the 'absolute' event for true north
        newHeading = (360 - e.alpha) % 360;
      }

      if (newHeading !== null && !isNaN(newHeading)) {
        headingRef.current = newHeading;
        setHeading(newHeading);
      }
    };

    const startListening = async () => {
      // Try to get permission first (iOS)
      const granted = await requestPermission();
      if (!granted || !isActive) return;

      // Prefer absolute orientation (true north) — falls back to regular
      const AbsoluteOrientationEvent =
        typeof window !== "undefined" && window.DeviceOrientationAbsoluteEvent
          ? window.DeviceOrientationAbsoluteEvent
          : DeviceOrientationEvent;

      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      window.addEventListener("deviceorientation", handleOrientation, true);

      // Fallback check: if no events fire after 1s on desktop, mark unsupported
      setTimeout(() => {
        if (isActive && headingRef.current === null) {
          setPermissionState("unsupported");
        }
      }, 1500);
    };

    startListening();

    return () => {
      isActive = false;
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [requestPermission]);

  return {
    heading,
    permissionState,
    requestPermission,
  };
}
