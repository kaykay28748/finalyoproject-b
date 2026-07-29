import { useMemo } from "react";

export function formatDistance(meters) {
  if (!meters && meters !== 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatTravelTime(meters, vehicleMode = "walk") {
  if (!meters && meters !== 0) return "";
  const MODE_SPEEDS = {
    walk: 5, car: 30, motorcycle: 25, bicycle: 15, jogging: 10,
  };
  const speedKmh = MODE_SPEEDS[vehicleMode] || 5;
  const minutes = Math.ceil(meters / ((speedKmh * 1000) / 60));
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function useRouteMetrics(route, vehicleMode) {
  return useMemo(() => {
    if (!route?.totalDistance) return null;
    const dist = route.totalDistance;
    return {
      distance: formatDistance(dist),
      time: formatTravelTime(dist, vehicleMode),
      rawDistance: dist,
    };
  }, [route?.totalDistance, vehicleMode]);
}
