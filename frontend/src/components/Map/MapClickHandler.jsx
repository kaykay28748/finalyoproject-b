// components/Map/MapClickHandler.jsx
import { useMapEvents } from "react-leaflet";
import { useHaptics } from "../../hooks/useHaptics";

// Listens for clicks on the map and forwards every click to the parent.
//
// The campus boundary check that used to live here was removed. It compared
// against UG_BOUNDS and returned early for anything outside Legon, so a user
// anywhere else in Accra could pan the map but could not set a start or
// destination — the click was swallowed with no error and no message, which
// reads as a broken app rather than a boundary.
//
// Routing outside campus is now supported by the server-side graph compiler
// (backend/src/services/graphSynchronizer.js), which can compile a region on
// demand rather than being limited to one hardcoded Legon bbox.
//
// The only guard kept is a hard coordinate sanity check. Leaflet can emit
// clicks with a null or non-finite latlng during rapid zoom/pan animations, and
// forwarding one produces a NaN in the geocode and routing paths, which is
// considerably harder to trace than a dropped event.
export default function MapClickHandler({ onMapClick }) {
  const { trigger } = useHaptics();
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      trigger(12);
      onMapClick(e.latlng);
    },
  });

  // This component handles events only — it renders nothing
  return null;
}