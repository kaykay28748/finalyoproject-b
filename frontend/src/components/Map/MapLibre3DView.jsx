// components/Map/MapLibre3DView.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useHaptics } from "../../hooks/useHaptics";
import { fetchHeatmapData } from "../../services/heatmapAnalytics";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

if (!MAPTILER_KEY) {
  console.warn("[MapLibre3D] VITE_MAPTILER_KEY not set.");
}

// Always use satellite mode - no terrain/explore toggling
const STYLE_SATELLITE_URL = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
const TERRAIN_SOURCE = `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`;

const UG_CENTER = { lng: -0.1865, lat: 5.651 };

const RAIN_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
const getRainIntensity = (code) => {
  if (!code) return 0;
  if ([95, 96, 99].includes(code)) return 1.0;
  if ([80, 81, 82, 63, 65].includes(code)) return 0.7;
  if ([61, 51, 53, 55].includes(code)) return 0.3;
  return 0;
};

const extractWeatherCode = (weather) => {
  if (!weather) return null;
  return (
    weather?.list?.[0]?.weather?.[0]?.id ??
    weather?.current?.weather?.[0]?.id ??
    weather?.weather?.[0]?.id ??
    weather?.weatherCode ??
    null
  );
};

const patchStyleSprite = (style) => {
  if (style?.sprite && !style.sprite.includes("key=")) {
    style.sprite = `${style.sprite}?key=${MAPTILER_KEY}`;
  }
  if (style?.glyphs && !style.glyphs.includes("key=")) {
    style.glyphs = `${style.glyphs}?key=${MAPTILER_KEY}`;
  }
  return style;
};

class RainParticles {
  constructor(canvas, intensity = 0.5) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: false });
    this.intensity = intensity;
    this.particles = [];
    this.animationId = null;
    this.isRunning = false;
    this._resize();
    this._init();
  }

  _resize() {
    this.canvas.width = this.canvas.offsetWidth || window.innerWidth;
    this.canvas.height = this.canvas.offsetHeight || window.innerHeight;
  }

  _init() {
    this.particles = [];
    const count = Math.floor(200 * this.intensity);
    for (let i = 0; i < count; i++) {
      this.particles.push(this._newParticle(true));
    }
  }

  _newParticle(randomY = false) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -10,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 3 + Math.random() * 4 * this.intensity,
      opacity: Math.random() * 0.4 + 0.2,
      length: Math.random() * 12 + 6,
      width: Math.random() * 1.5 + 0.5,
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._loop();
  }

  _loop = () => {
    if (!this.isRunning) return;
    const { ctx, canvas, particles } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.y > canvas.height + p.length) {
        particles[i] = this._newParticle(false);
        continue;
      }
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;

      ctx.globalAlpha = p.opacity;
      ctx.strokeStyle = "rgba(200, 225, 255, 0.9)";
      ctx.lineWidth = p.width + 1;
      ctx.shadowColor = "rgba(200, 225, 255, 0.5)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 3, p.y + p.length);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    this.animationId = requestAnimationFrame(this._loop);
  };

  stop() {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setIntensity(intensity) {
    if (this.intensity !== intensity) {
      this.intensity = intensity;
      this._init();
    }
  }

  destroy() {
    this.stop();
    this.particles = [];
  }
}

export default function MapLibre3DView({
  visible = false,
  currentLocation,
  flyTarget,
  primaryRoute,
  alternativeRoutes = [],
  markersVisible,
  startPoint,
  destPoint,
  onMapClick,
  weather,
  showHeatmap,
  selectedHour,
  shakeTrigger = 0, // Counter to trigger the "nudge" effect
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const { trigger } = useHaptics();
  const rainCanvasRef = useRef(null);
  const rainSystemRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const heatmapLayerIdRef = useRef(null);
  const heatmapDebounceRef = useRef(null);
  const lastRouteKeyRef = useRef('');

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const makeMarkerEl = (color, large) => {
    const el = document.createElement("div");
    const s = large ? 28 : 20;
    el.style.cssText = `width:${s}px;height:${s}px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5),0 0 0 4px rgba(0,0,0,0.2);`;
    return el;
  };

  const addTerrainSource = useCallback((map) => {
    if (!map || !map.getContainer()) return;
    try {
      if (!map.getSource("terrain-source")) {
        map.addSource("terrain-source", {
          type: "raster-dem",
          url: TERRAIN_SOURCE,
          tileSize: 256,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "terrain-source", exaggeration: 1.0 });
    } catch (err) {
      console.warn("[MapLibre3D] Terrain skipped:", err.message);
    }
  }, []);

  const dimWater = useCallback((map) => {
    ["water", "waterway", "water-shadow", "sea", "ocean"].forEach((layerName) => {
      if (map.getLayer(layerName)) {
        try {
          map.setPaintProperty(layerName, "fill-color", "rgba(160, 175, 190, 0.5)");
        } catch (_) {}
      }
    });
  }, []);

  const stripHeavyLayers = useCallback((map) => {
    const removeLayers = ["hillshade", "contour", "landcover"];
    removeLayers.forEach((id) => {
      if (map.getLayer(id)) {
        try { map.removeLayer(id); } catch (_) {}
      }
    });
  }, []);

  const removeHeatmap = useCallback((map) => {
    if (!map) return;
    const lid = heatmapLayerIdRef.current;
    try { if (lid && map.getLayer(lid)) map.removeLayer(lid); } catch (_) {}
    try { if (map.getSource("heatmap-3d")) map.removeSource("heatmap-3d"); } catch (_) {}
    heatmapLayerIdRef.current = null;
  }, []);

  const updateHeatmap = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !showHeatmap || !mapLoaded || !navigator.onLine) return;

    try {
      const bounds = map.getBounds();
      if (!bounds) return;
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();
      if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) return;

      const points = await fetchHeatmapData(bounds, { hour: selectedHour });
      if (!points?.length) return;
      if (!mapRef.current) return;

      const features = points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { intensity: p.weight ?? 0.5 },
      }));

      removeHeatmap(map);

      map.addSource("heatmap-3d", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      const lid = `hm-${Date.now()}`;
      heatmapLayerIdRef.current = lid;

      map.addLayer({
        id: lid,
        type: "heatmap",
        source: "heatmap-3d",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,255,0)",
            0.2, "#313695",
            0.4, "#4575b4",
            0.5, "#74add1",
            0.6, "#fee090",
            0.7, "#f46d43",
            0.8, "#d73027",
            1, "#a50026",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 20],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 1, 9, 0.6],
        },
      }, "water");
    } catch (err) {
      console.error("[MapLibre3D] Heatmap error:", err);
    }
  }, [showHeatmap, selectedHour, mapLoaded, removeHeatmap]);

  // ── map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    fetch(STYLE_SATELLITE_URL)
      .then((res) => res.json())
      .then((style) => {
        if (!mapContainer.current) return;
        patchStyleSprite(style);

        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: style,
          center: [UG_CENTER.lng, UG_CENTER.lat],
          zoom: 15,
          minZoom: 13,
          maxZoom: 17,
          pitch: 60,
          pixelRatio: 1,
          antialias: false,
          attributionControl: false,
          fadeDuration: 0,
          maxTileCacheSize: 500,
          failIfMissingGlyphs: false,
          preserveDrawingBuffer: false,
          maxWorkerCount: 2,
          localFontFamily: "system-ui, sans-serif",
          collectResourceTiming: false,
        });

        map.addControl(
          new maplibregl.NavigationControl({ visualizePitch: true }),
          "top-right"
        );

        map.on("load", () => {
          if (!mapRef.current) return;
          addTerrainSource(map);
          dimWater(map);
          stripHeavyLayers(map);
          lastRouteKeyRef.current = '';
          setMapLoaded(true);
        });

        map.on("click", (e) => {
          trigger(12);
          if (onMapClick) onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });

        const onMoveEnd = () => {
          if (!showHeatmap) return;
          clearTimeout(heatmapDebounceRef.current);
          heatmapDebounceRef.current = setTimeout(updateHeatmap, 500);
        };
        map.on("moveend", onMoveEnd);
        map.on("zoomend", onMoveEnd);

        mapRef.current = map;
      });

    return () => {
      clearTimeout(heatmapDebounceRef.current);
      clearMarkers();
      if (rainSystemRef.current) {
        rainSystemRef.current.destroy();
        rainSystemRef.current = null;
      }
      const m = mapRef.current;
      mapRef.current = null;
      setMapLoaded(false);
      try { m?.remove(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fix 1: Handle missing images to prevent infinite render loop ──────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMissingImage = (e) => {
      // Add a transparent 1x1 placeholder for missing images
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 1, 1);
        map.addImage(e.id, canvas);
      } catch (err) {
        // Silently fail - just don't crash
      }
    };

    map.on('styleimagemissing', handleMissingImage);

    return () => {
      try {
        map.off('styleimagemissing', handleMissingImage);
      } catch (_) {}
    };
  }, []);

  // ── Fix 2: Handle tile errors to prevent retry loop ──────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleTileError = (e) => {
      // Prevent infinite tile retry
      if (e.tile) {
        e.tile.retry = false;
      }
    };

    map.on('tileerror', handleTileError);

    return () => {
      try {
        map.off('tileerror', handleTileError);
      } catch (_) {}
    };
  }, []);

  // ── Fix 3: Suppress known MapLibre warnings ──────────────────────────────

  useEffect(() => {
    // Suppress known MapLibre missing image warnings
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const msg = args[0] || '';
      if (typeof msg === 'string') {
        if (msg.includes('Image " " could not be loaded')) return;
        if (msg.includes('Image "office" could not be loaded')) return;
      }
      originalWarn(...args);
    };

    // Restore after component unmounts
    return () => {
      console.warn = originalWarn;
    };
  }, []);

  // ── force route redraw when 3D becomes visible ────────────────────────────

  useEffect(() => {
    if (visible) {
      lastRouteKeyRef.current = '';
    }
  }, [visible]);

  // ── rain ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || !rainCanvasRef.current) return;

    const code = extractWeatherCode(weather);
    const intensity = getRainIntensity(code);

    if (!rainSystemRef.current) {
      rainSystemRef.current = new RainParticles(rainCanvasRef.current, intensity);
    } else {
      rainSystemRef.current.setIntensity(intensity);
    }

    if (intensity > 0) {
      rainCanvasRef.current.style.opacity = "1";
      rainSystemRef.current.start();
    } else {
      rainCanvasRef.current.style.opacity = "0";
      rainSystemRef.current.stop();
    }
  }, [weather, visible]);

  // ── fly to target ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !flyTarget) return;
    try {
      mapRef.current.flyTo({
        center: [flyTarget.lng, flyTarget.lat],
        zoom: 17.5,           // Tighter zoom for targets
        pitch: 65,            // More dramatic tilt
        duration: 2000,       // Slower, more premium feel
        essential: true,      // Ensures animation runs even if user is moving
        curve: 1.42,          // Controls the "height" of the parabolic arc
      });
    } catch (_) {}
  }, [flyTarget]);

  // ── Camera Nudge (The "Senior" Shake) ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || shakeTrigger === 0) return;

    try {
      // 1. Physical Feedback (Haptic)
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // Double thud
      }

      // 2. Visual Nudge (Pitch Dip)
      const currentPitch = mapRef.current.getPitch();
      
      // Briefly dip the pitch and zoom slightly
      mapRef.current.easeTo({
        pitch: currentPitch + 10,
        zoom: mapRef.current.getZoom() + 0.2,
        duration: 100,
      });

      // Return to original state with a slower, smoother curve
      setTimeout(() => {
        mapRef.current?.easeTo({
          pitch: currentPitch,
          zoom: mapRef.current.getZoom() - 0.2,
          duration: 400,
          easing: (t) => t * (2 - t), // Ease out
        });
      }, 100);
    } catch (err) {
      console.warn("[MapLibre3D] Nudge failed:", err);
    }
  }, [shakeTrigger]);

  const hasFlownRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current || !currentLocation || hasFlownRef.current) return;
    try {
      mapRef.current.flyTo({
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 18,             // Focus on the user
        pitch: 60,
        duration: 2500,
        essential: true,
      });
      hasFlownRef.current = true;
    } catch (_) {}
  }, [currentLocation]);

  // ── markers ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    clearMarkers();

    // Helper to check if a pin is basically on top of the blue dot
    const isAtCurrent = (loc) => {
      if (!loc || !currentLocation) return false;
      const dLat = Math.abs(loc.lat - currentLocation.lat);
      const dLng = Math.abs(loc.lng - currentLocation.lng);
      return dLat < 0.00005 && dLng < 0.00005; // ~5 meter tolerance
    };

    const add = (loc, color, large) => {
      const m = new maplibregl.Marker({
        element: makeMarkerEl(color, large),
        anchor: large ? "bottom" : "center",
      })
        .setLngLat([loc.lng, loc.lat])
        .addTo(mapRef.current);
      markersRef.current.push(m);
    };

    if (currentLocation) add(currentLocation, "#2563eb", false);
    // Only show pins if they aren't redundant with the current location dot
    if (startPoint && !isAtCurrent(startPoint)) add(startPoint, "#2563eb", true);
    if (destPoint && !isAtCurrent(destPoint)) add(destPoint, "#22c55e", true); // destPoint here is finalDestPoint from App.jsx
  }, [currentLocation, startPoint, destPoint, mapLoaded, clearMarkers]);



  // ── routes ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!markersVisible || !primaryRoute?.coordinates?.length) {
      ["primary-route-glow", "primary-route-line", "alt-route-line"].forEach((id) => {
        try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
      });
      ["primary-route", "alt-routes"].forEach((id) => {
        try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
      });
      lastRouteKeyRef.current = '';
      return;
    }

    const routeKey = `${primaryRoute.totalDistance}-${primaryRoute.coordinates?.length}-${alternativeRoutes?.length}`;
    if (routeKey === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = routeKey;

    ["primary-route-glow", "primary-route-line", "alt-route-line"].forEach((id) => {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
    });
    ["primary-route", "alt-routes"].forEach((id) => {
      try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
    });

    const coords = primaryRoute.coordinates.map((c) => [c.lng, c.lat]);
    map.addSource("primary-route", {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
    });

    map.addLayer({
      id: "primary-route-glow",
      type: "line", source: "primary-route",
      paint: { "line-color": "#2563eb", "line-width": 10, "line-opacity": 0.25, "line-blur": 4 },
      layout: { "line-cap": "round", "line-join": "round" },
    });

    map.addLayer({
      id: "primary-route-line",
      type: "line", source: "primary-route",
      paint: { "line-color": "#3b82f6", "line-width": 6, "line-opacity": 1 },
      layout: { "line-cap": "round", "line-join": "round" },
    });

    const altFeatures = (alternativeRoutes ?? [])
      .filter((a) => a.route?.coordinates?.length)
      .map((a) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: a.route.coordinates.map((c) => [c.lng, c.lat]) },
      }));

    if (altFeatures.length) {
      map.addSource("alt-routes", { type: "geojson", data: { type: "FeatureCollection", features: altFeatures } });
      map.addLayer({
        id: "alt-route-line", type: "line", source: "alt-routes",
        paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.5, "line-dasharray": [4, 6] },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }
  }, [primaryRoute, alternativeRoutes, markersVisible, mapLoaded]);

  // ── heatmap toggle ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapLoaded) return;
    if (showHeatmap) {
      updateHeatmap();
    } else {
      removeHeatmap(mapRef.current);
    }
  }, [showHeatmap, mapLoaded, updateHeatmap, removeHeatmap]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={mapContainer}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: visible ? 1 : 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: visible ? "auto" : "none",
        }}
      />
      {visible && (
        <canvas
          ref={rainCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 1000,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.4s ease-in-out",
          }}
        />
      )}
    </>
  );
}