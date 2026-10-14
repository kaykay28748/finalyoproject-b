// frontend/src/hooks/useGeolocation.js
import { useState, useEffect, useRef, useCallback } from "react";

// A fix is only trustworthy enough to drive routing/auto-fill when the browser
// reports it within this radius. Plain GPS on a phone is usually < 20 m, while
// desktop browsers derive position from Wi-Fi/IP and are frequently off by
// kilometres (accuracy in the thousands). Without this gate a coarse desktop
// fix got snapped to the nearest campus node and produced wrong routes and
// "No path found" errors.
export const MAX_USABLE_ACCURACY_M = 100;
// Above this the marker is drawn in amber so the user can see the fix is coarse.
export const LOW_ACCURACY_M = 50;

export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const [permissionState, setPermissionState] = useState("prompt");

  const watchIdRef = useRef(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return;
    stopWatching();

    const options = { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 };

    const handleSuccess = (pos) => {
      const { latitude, longitude, accuracy: acc } = pos.coords;
      setLocation({ lat: latitude, lng: longitude });
      setAccuracy(Math.round(acc));
      setError(null);
    };

    const handleError = (err) => {
      setError(err.message);
      if (err.code === 1) setPermissionState("denied");
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess, handleError, options
    );
  }, [stopWatching]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      setPermissionState("unsupported");
      return;
    }

    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
        setAccuracy(Math.round(acc));
        setError(null);
        setPermissionState("granted");
        startWatching();
      },
      (err) => {
        if (err.code === 1) {
          setPermissionState("denied");
          setError("Location access is blocked. Enable location in your browser settings.");
        } else {
          setError(err.message);
        }
        startWatching();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [stopWatching, startWatching]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      setPermissionState("unsupported");
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then((status) => {
        setPermissionState(status.state);
        if (status.state === "granted") {
          startWatching();
        } else if (status.state === "prompt") {
          requestLocation();
        }
      }).catch(() => {
        requestLocation();
      });
    } else {
      requestLocation();
    }

    return stopWatching;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAccurate = accuracy != null && accuracy <= MAX_USABLE_ACCURACY_M;
  const isLowAccuracy = accuracy != null && accuracy > LOW_ACCURACY_M;

  return { location, accuracy, error, permissionState, requestLocation, isAccurate, isLowAccuracy };
}