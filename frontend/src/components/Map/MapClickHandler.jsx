// components/Map/MapClickHandler.jsx
import { useMapEvents } from "react-leaflet";
import { UG_BOUNDS } from "../../function/utils/bounds";
import { useHaptics } from "../../hooks/useHaptics";

// Listens for clicks on the map and calls onMapClick only if the
// click falls within the UG community boundary.
// The parent (App.jsx) handles closing NavPanel on click.
export default function MapClickHandler({ onMapClick }) {
  const { trigger } = useHaptics();
  useMapEvents({
    click(e) {
      if (!UG_BOUNDS.contains(e.latlng)) return;
      trigger(12);
      onMapClick(e.latlng);
    },
  });

  // This component handles events only — it renders nothing
  return null;
}