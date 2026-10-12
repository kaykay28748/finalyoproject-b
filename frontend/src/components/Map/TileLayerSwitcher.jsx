import { TileLayer } from "react-leaflet";

const TILE_URLS = {
  standard: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  cycle: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  transport: "https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png",
  humanitarian: "https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png",
};

const TILE_ATTRS = {
  standard: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  cycle: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://cyclosm.org">CycleOSM</a>',
  transport: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://memomaps.de/">MenoMaps</a>',
  humanitarian: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>',
};

export default function TileLayerSwitcher({ layer, darkMode }) {
  // Backward compatibility: if darkMode is passed (legacy Map.jsx), map to layer
  const resolved = darkMode !== undefined ? (darkMode ? "dark" : "standard") : (layer || "standard");
  const url = TILE_URLS[resolved] || TILE_URLS.standard;
  const attr = TILE_ATTRS[resolved] || TILE_ATTRS.standard;

  return (
    <TileLayer
      url={url}
      attribution={attr}
      maxZoom={19}
      // Layer minZoom must NOT exceed the map's fitted zoom. The map now opens
      // by fitting the whole METRO_BOUNDS (often ~zoom 12 on desktop), so the
      // old minZoom of 13 left the viewport blank — Leaflet's TileLayer skips
      // rendering whenever the map zoom falls below the layer's minZoom.
      minZoom={2}
      keepBuffer={4}
      updateWhenIdle={true}
      updateWhenZooming={false}
      preferCanvas={true}
      detectRetina={false}
      crossOrigin={false}
    />
  );
}