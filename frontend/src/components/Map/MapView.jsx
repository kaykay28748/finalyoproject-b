// components/Map/MapView.jsx
import { MapContainer, useMap, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import { useEffect, useRef, useState, memo, lazy, Suspense } from "react";

import TileLayerSwitcher from "./TileLayerSwitcher";
import SmoothFly from "./SmoothFly";
import InitialFly from "./InitialFly";
import MapClickHandler from "./MapClickHandler";
import { GpsLocationMarker, CustomLocationMarker } from "./LocationMarker";
import RouteMarkers from "./RouteMarkers";
import RouteLayer from "./RouteLayer";
import HeatmapLayer from "./HeatmapLayer";
import Legend from "../Legend/Legend";
import WeatherOverlay from "./WeatherOverlay";
import FloatingButtonGroup from "./FloatingButtonGroup";
import LayerSwitcher from "./LayerSwitcher";
import CompassButton from "./CompassButton";
import ReportMarkers from "./ReportMarkers";
import { useWeather } from "../../hooks/useWeather";
import { useDeviceHeading } from "../../hooks/useDeviceHeading";
import "../Legend/Legend.css";

import {
  UG_MAX_BOUNDS,
  UG_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../../function/utils/bounds";
import "./MapView.css";

import { ROUTE_COLORS } from "../../function/utils/colors";

// Lazy-load the 3D map only when the user actually enables 3D mode.
// If the module fails to load, keep the 2D experience intact instead of crashing.
const SafeMapLibre3DView = lazy(() =>
  import("./MapLibre3DView").catch((error) => {
    console.warn("[MapView] 3D map failed to load, falling back to 2D view:", error);
    return { default: () => null };
  })
);

// ── MapBearingController — syncs bearing prop to the Leaflet map instance ────
const MapBearingController = memo(function MapBearingController({ bearing }) {
  const map = useMap();

  useEffect(() => {
    if (map && typeof map.setBearing === "function") {
      map.setBearing(bearing || 0);
    }
  }, [map, bearing]);

  return null;
});

// ── SmartFitBounds (memoized to prevent re-renders) ────────────────────────────
const SmartFitBounds = memo(function SmartFitBounds({
  startPoint,
  destPoint,
  visible,
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible || !startPoint) return;

    if (startPoint && destPoint) {
      const bounds = [
        [startPoint.lat, startPoint.lng],
        [destPoint.lat, destPoint.lng],
      ];

      const R = 6371000;
      const dLat = ((destPoint.lat - startPoint.lat) * Math.PI) / 180;
      const dLng = ((destPoint.lng - startPoint.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((startPoint.lat * Math.PI) / 180) *
          Math.cos((destPoint.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const isMobile = window.innerWidth < 600;

      let padding;
      if (isMobile) {
        if (distance < 50) padding = [20, 20];
        else if (distance < 200) padding = [30, 30];
        else if (distance < 500) padding = [40, 40];
        else if (distance < 1000) padding = [50, 50];
        else if (distance < 2000) padding = [60, 60];
        else padding = [80, 80];
      } else {
        if (distance < 50) padding = [30, 30];
        else if (distance < 200) padding = [50, 50];
        else if (distance < 500) padding = [70, 70];
        else if (distance < 1000) padding = [90, 90];
        else if (distance < 2000) padding = [120, 120];
        else padding = [180, 180];
      }

      const basePad = padding[1];
      const topPad = isMobile ? basePad + 50 : basePad + 80;
      const botPad = isMobile ? basePad + 50 : basePad + 80;

      map.flyToBounds(bounds, {
        padding: [topPad, basePad, botPad, basePad],
        maxZoom: 18,
        duration: 0.8,
      });
    } else if (startPoint && !destPoint) {
      map.flyTo([startPoint.lat, startPoint.lng], 16, { duration: 0.8 });
    }
  }, [map, startPoint, destPoint, visible]);

  return null;
});

// Memoized Polyline for alternate routes
const MemoizedAlternateRoute = memo(function MemoizedAlternateRoute({
  coords,
  color,
  weight,
  opacity,
}) {
  if (!coords?.length) return null;
  return (
    <Polyline
      positions={coords.map((c) => [c.lat, c.lng])}
      color={color}
      weight={weight}
      opacity={opacity}
      smoothFactor={2}
      lineCap="round"
      lineJoin="round"
      className="alternative-route"
      interactive={false}
    />
  );
});

// ── MapView ───────────────────────────────────────────────────────────────────
export default function MapView({
  currentLocation,
  accuracy,
  customStartPoint,
  startPoint,
  destPoint,
  startText,
  destText,
  markersVisible,
  primaryRoute,
  alternativeRoutes = [],
  allRoutes = null,
  isRouting = false,
  isRerouting = false,
  deviationDetected = false,
  warnings = [],
  activeProfile = "standard",
  vehicleMode = "walk",
  flyTarget,
  darkMode,
  waitingForStart,
  useCustomLocation = false,
  isSharedLocation = false,
  isLegendExpanded = true,
  onLegendExpandedChange,
  onProfileChange,
  onVehicleModeChange,
  onMapClick,
  onCustomLocationDragEnd,
  onRecenter,
  isRouteLocked = false,
  registerLegendCollapse,
  showHeatmap = false,
  onToggleHeatmap,
  selectedHour,
  onSelectedHourChange,
  onOpenReportModal,
  isNavExpanded = false,
  onNavPanelClose,
  isPanelTransitioning = false,
  isMapBlurred = false,
  mapLayer = "standard",
  onMapLayerChange,
}) {
  const showDestinationMarker = !!destPoint;
  const displayStartPoint =
    useCustomLocation && customStartPoint ? customStartPoint : startPoint;
  const showStartMarker = useCustomLocation && !!customStartPoint;

  const legendRef = useRef(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [map, setMap] = useState(null);

  // 2D/3D toggle state
  const [is3DMode, setIs3DMode] = useState(false);

  const [heatmapPoints, setHeatmapPoints] = useState(null);

  // Weather hook
  const { weather } = useWeather();

  useEffect(() => {
    if (registerLegendCollapse && legendRef.current) {
      registerLegendCollapse(() => legendRef.current?.collapse());
    }
    return () => {
      if (registerLegendCollapse) registerLegendCollapse(null);
    };
  }, [registerLegendCollapse]);

  const hasValidRoute = primaryRoute?.coordinates?.length > 0;

  // Beam shows only when route starts at GPS location
  const isGpsStart = currentLocation && hasValidRoute &&
    Math.abs(primaryRoute.coordinates[0].lat - currentLocation.lat) < 0.0001 &&
    Math.abs(primaryRoute.coordinates[0].lng - currentLocation.lng) < 0.0001;

  // Track map bounds for heatmap controls (2D only)
  useEffect(() => {
    if (is3DMode) return;
    const container = document.querySelector(".leaflet-container");
    if (container && container._leaflet_map) {
      const leafletMap = container._leaflet_map;
      setMap(leafletMap);

      const updateBounds = () => {
        if (leafletMap) {
          const bounds = leafletMap.getBounds();
          setMapBounds({
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          });
        }
      };

      leafletMap.on("moveend", updateBounds);
      leafletMap.on("zoomend", updateBounds);
      updateBounds();

      return () => {
        leafletMap.off("moveend", updateBounds);
        leafletMap.off("zoomend", updateBounds);
      };
    }
  }, [is3DMode]);

  const handleToggle3D = () => {
    setIs3DMode((prev) => !prev);
  };

  const [currentRouteDirection, setCurrentRouteDirection] = useState(0);
  const [smoothedRoutePosition, setSmoothedRoutePosition] = useState(null);

  // ── Heading / Compass state ────────────────────────────────────────────
  const [isHeadingUp, setIsHeadingUp] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const { heading: deviceHeading, permissionState: headingPermission, requestPermission: requestHeadingPermission } = useDeviceHeading();

  // ── Compute map bearing for heading-up mode ────────────────────────────
  const prevPositionRef = useRef(null);
  const travelBearingRef = useRef(0);

  // Compute travel bearing from consecutive GPS positions
  useEffect(() => {
    if (!currentLocation || !isHeadingUp) return;
    const prev = prevPositionRef.current;
    if (prev) {
      const dLat = (currentLocation.lat - prev.lat) * Math.PI / 180;
      const dLng = (currentLocation.lng - prev.lng) * Math.PI / 180;
      const lat1 = prev.lat * Math.PI / 180;
      const lat2 = currentLocation.lat * Math.PI / 180;
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      // Only update if moved more than 3m (filter GPS jitter)
      const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111319;
      if (dist > 3) {
        travelBearingRef.current = bearing;
      }
    }
    prevPositionRef.current = { ...currentLocation };
  }, [currentLocation, isHeadingUp]);

  useEffect(() => {
    if (!isHeadingUp) {
      setMapBearing(0);
      return;
    }

    // Priority: device heading > route bearing > travel bearing
    if (deviceHeading != null) {
      setMapBearing(deviceHeading);
    } else if (currentRouteDirection && currentRouteDirection !== 0) {
      setMapBearing(currentRouteDirection);
    } else if (travelBearingRef.current) {
      setMapBearing(travelBearingRef.current);
    }
  }, [isHeadingUp, deviceHeading, currentRouteDirection]);

  const handleCompassToggle = () => {
    setIsHeadingUp((prev) => !prev);
  };

  return (
    <>
      <div className={`map-wrap ${isMapBlurred ? "map-blurred" : ""}`}>
      {/* Apple-style glass blur overlay */}
      <div
        className="map-blur-overlay"
        style={{
          // Senior Fix: Ensure map stays sharp while legend is expanded
          opacity: isNavExpanded ? 1 : 0,
        }}
      />

      {/* ── 2D Leaflet Map ──────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: is3DMode ? 0 : 1,
          opacity: is3DMode ? 0 : 1,
          transition: "opacity 0.3s ease",
          pointerEvents: is3DMode ? "none" : "auto",
        }}
      >
        <MapContainer
          center={[UG_CENTER.lat, UG_CENTER.lng]}
          zoom={DEFAULT_ZOOM}
          maxBounds={UG_MAX_BOUNDS}
          maxBoundsViscosity={0.7}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          zoomControl={false}
          preferCanvas={true}
          zoomSnap={0.5}
          zoomDelta={0.5}
          wheelPxPerZoomLevel={100}
          bearing={mapBearing}
          style={{ height: "100%", width: "100%" }}
        >
          <MapBearingController bearing={mapBearing} />
          <TileLayerSwitcher layer={mapLayer} />
          <SmoothFly target={flyTarget} />
          <InitialFly location={currentLocation} />
          <SmartFitBounds
            startPoint={displayStartPoint}
            destPoint={destPoint}
            visible={markersVisible}
          />
          <MapClickHandler onMapClick={onMapClick} />

          <GpsLocationMarker  location={currentLocation} accuracy={accuracy} routeDirection={currentRouteDirection} smoothedPosition={smoothedRoutePosition} deviceHeading={deviceHeading} />

          {currentLocation && (
            <Marker
              position={[currentLocation.lat, currentLocation.lng]}
              icon={L.divIcon({
                className: "",
                html: `<div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:45px solid #2563eb;opacity:0.35;transform:rotate(${currentRouteDirection || deviceHeading || 0}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.15));"></div>`,
                iconSize: [24, 45],
                iconAnchor: [12, 45],
              })}
              interactive={false}
            />
          )}

          <CustomLocationMarker
            location={customStartPoint}
            onDragEnd={onCustomLocationDragEnd}
            visible={useCustomLocation && !!customStartPoint}
          />

          <HeatmapLayer visible={showHeatmap} selectedHour={selectedHour} />

          {markersVisible && hasValidRoute && (
            <RouteLayer
              route={primaryRoute}
              visible={markersVisible}
              profile={activeProfile}
              vehicleMode={vehicleMode}
              currentLocation={currentLocation}
              showProgress={true}
              onRouteDirectionChange={setCurrentRouteDirection}
            />
          )}

          {markersVisible && alternativeRoutes.length > 0 && (
            <>
              {alternativeRoutes.map((alt) => {
                const coords = alt.route?.coordinates;
                if (!coords?.length) return null;
                const isPrimaryVisible = hasValidRoute;
                const opacity = isPrimaryVisible ? 0.65 : 0.85;
                const weight = isPrimaryVisible ? 5 : 6;

                return (
                  <MemoizedAlternateRoute
                    key={`alt-${alt.profile}-${alt.route?.totalDistance}`}
                    coords={coords}
                    color={ROUTE_COLORS[alt.profile]}
                    weight={weight}
                    opacity={opacity}
                  />
                );
              })}
            </>
          )}

          <RouteMarkers
            startPoint={null}
            destPoint={destPoint}
            visible={showDestinationMarker}
            isShared={isSharedLocation}
          />

          <RouteMarkers
            startPoint={isGpsStart ? null : displayStartPoint}
            destPoint={destPoint}
            visible={markersVisible}
            isShared={isSharedLocation}
          />

          <WeatherOverlay weather={weather} />

          <ReportMarkers />
        </MapContainer>
      </div>

      {/* ── 3D MapLibre Map ─────────────────────────────────────────────── */}
      {is3DMode && (
        <Suspense fallback={null}>
          <SafeMapLibre3DView
            visible={is3DMode}
            currentLocation={currentLocation}
            flyTarget={flyTarget}
            primaryRoute={primaryRoute}
            alternativeRoutes={alternativeRoutes}
            markersVisible={markersVisible}
            startPoint={displayStartPoint}
            destPoint={destPoint}
            darkMode={darkMode}
            onMapClick={onMapClick}
            weather={weather}
            showHeatmap={showHeatmap}
            selectedHour={selectedHour}
          />
        </Suspense>
      )}

      {/* ── iOS-style Glassmorphism Floating Button Group ───────────────────── */}
      <FloatingButtonGroup
        buttons={[
          {
            icon: (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 6 12 12 16 14" />
                <line x1="12" y1="12" x2="12" y2="18" />
              </svg>
            ),
            label: "Recenter",
            onClick: onRecenter,
            active: false,
          },
          {
            // 2D/3D Toggle
            icon: is3DMode ? (
              <span
                style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1 }}
              >
                2D
              </span>
            ) : (
              <span
                style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1 }}
              >
                3D
              </span>
            ),
            label: is3DMode ? "Switch to 2D" : "Switch to 3D",
            onClick: handleToggle3D,
            active: is3DMode,
          },
          {
            icon: (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="2" />
                <path d="M12 2v4M22 12h-4M12 20v4M4 12H2M19.07 4.93l-2.83 2.83M6.9 17.1l-2.83 2.83M17.1 17.1l2.83 2.83M4.93 4.93l2.83 2.83" />
              </svg>
            ),
            label: "Heatmap",
            onClick: onToggleHeatmap,
            active: showHeatmap,
          },
          {
            icon: (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 19h20L12 2z" />
                <line x1="12" y1="9" x2="12" y2="13" stroke="white" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" />
              </svg>
            ),
            label: "Report Issue",
            onClick: onOpenReportModal,
            active: false,
          },
        ]}
      />

      {/* ── Layer Switcher (right side) ──────────────────────────── */}
      <LayerSwitcher
        mapLayer={mapLayer}
        onMapLayerChange={onMapLayerChange}
      />

      {/* ── Compass (right side, below LayerSwitcher) ────────────── */}
      <CompassButton
        heading={deviceHeading}
        isHeadingUp={isHeadingUp}
        onToggle={handleCompassToggle}
        permissionState={headingPermission}
        onRequestPermission={requestHeadingPermission}
      />



      {isRerouting && (
        <div className="rerouting-indicator">
          <div className="rerouting-spinner-small" />
          <span>Updating route...</span>
        </div>
      )}

      {markersVisible && isRouting && !hasValidRoute && (
        <div className="route-loading">
          <div className="route-loading-spinner" />
          <span>Calculating routes...</span>
        </div>
      )}
      </div>

      <Legend
        ref={legendRef}
        startText={displayStartPoint?.name || startText || "Start"}
        destText={destText}
        visible={markersVisible || showHeatmap}
        route={primaryRoute}
        allRoutes={allRoutes}
        activeProfile={activeProfile}
        vehicleMode={vehicleMode}
        currentLocation={currentLocation}
        warnings={warnings}
        onProfileChange={onProfileChange}
        onVehicleModeChange={onVehicleModeChange}
        isExpanded={isLegendExpanded}
        onExpandedChange={onLegendExpandedChange}
        autoCollapse={isNavExpanded}
        disableDrag={isPanelTransitioning}
        onNavPanelClose={onNavPanelClose}
        showHeatmap={showHeatmap}
        selectedHour={selectedHour}
        onSelectedHourChange={onSelectedHourChange}
        heatmapBounds={mapBounds}
      />

      {waitingForStart && (
        <div className="map-tap-hint map-tap-hint--start">
          📍 Tap to set start point
        </div>
      )}
    </>
  );
}
