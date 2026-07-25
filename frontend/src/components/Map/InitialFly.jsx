import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

// Flies to the user's current location exactly once — on the first GPS fix
// Subsequent location updates don't trigger another fly-to
export default function InitialFly({ location }) {
  const map  = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (location && !done.current) {
      map.flyTo([location.lat, location.lng], 17, {
        duration: 1.6,
        easeLinearity: 0.25,
      });
      done.current = true;
    }
  }, [location, map]);

  return null;
}