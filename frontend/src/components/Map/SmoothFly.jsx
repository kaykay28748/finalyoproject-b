import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

// Smoothly animates the map to a new target location whenever the target changes
// Uses a ref to avoid re-flying to the same location on unrelated re-renders
export default function SmoothFly({ target }) {
  const map  = useMap();
  const prev = useRef(null);

  useEffect(() => {
    if (target && target !== prev.current) {
      map.flyTo([target.lat, target.lng], target.zoom ?? 17, {
        duration: 1.4,
        easeLinearity: 0.25,
      });
      prev.current = target;
    }
  }, [target, map]);

  return null;
}