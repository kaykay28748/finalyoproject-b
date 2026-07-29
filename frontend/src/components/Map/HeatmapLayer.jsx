import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from 'leaflet';
import 'leaflet.heat';
import { fetchHeatmapData } from "../../services/heatmapAnalytics";

const FETCH_DEBOUNCE_MS = 800;
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export default function HeatmapLayer({ visible, selectedHour }) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  const debounceRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const refreshData = useCallback(async () => {
    if (!visible || !heatLayerRef.current) return;

    try {
      const bounds = map.getBounds();
      const points = await fetchHeatmapData(bounds, { hour: selectedHour });

      if (heatLayerRef.current && points.length > 0) {
        heatLayerRef.current.setLatLngs(points.map(p => [p.lat, p.lng, p.weight]));
      }
    } catch (err) {
      console.error("[HeatmapLayer] Fetch failed:", err);
    }
  }, [visible, map, selectedHour]);

  const refreshDataRef = useRef(refreshData);
  refreshDataRef.current = refreshData;

  // Create/destroy heat layer
  useEffect(() => {
    if (!visible) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    if (!L.heatLayer) {
      console.warn("[HeatmapLayer] leaflet.heat not loaded - check import");
      return;
    }

    heatLayerRef.current = L.heatLayer([], {
      radius: 20,
      blur: 15,
      max: 1.0,
      minOpacity: 0.3,
      gradient: {
        0.0: '#313695',
        0.2: '#4575b4',
        0.4: '#74add1',
        0.5: '#fee090',
        0.7: '#f46d43',
        0.9: '#d73027',
        1.0: '#a50026',
      },
    }).addTo(map);

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [visible, map]);

  // Refresh on map movement and time filter
  useEffect(() => {
    if (!visible) return;

    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => refreshDataRef.current(), FETCH_DEBOUNCE_MS);
    };

    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
    refreshDataRef.current();

    return () => {
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [visible, map]);

  // Auto-refresh
  useEffect(() => {
    if (!visible) return;
    refreshTimerRef.current = setInterval(() => refreshDataRef.current(), AUTO_REFRESH_MS);
    return () => clearInterval(refreshTimerRef.current);
  }, [visible]);

  // Refetch when time filter changes
  useEffect(() => {
    if (visible) refreshDataRef.current();
  }, [selectedHour, visible]);

  return null;
}