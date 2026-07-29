// frontend/src/App.jsx - Simplified (no auth guards, no admin route)
import { useState, useCallback, lazy, Suspense, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGeolocation } from "./hooks/useGeolocation";
import { useRealtimeRoutes } from "./hooks/useRealtimeRoutes";
import { geocode, reverseGeocode } from "./services/geocoding";
import { findNearestNode } from "./services/routing";
import { buildGraph } from "./services/graphBuilder";
import { loadPreferences, savePreferences, loadRouteState, saveRouteState, clearRouteState } from "./services/preferencesStore";
import { logRouteCalculated, logSearch, logLogin } from "./services/analyticsLogger";
import NavPanel from "./components/Panel/NavPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineIndicator from "./components/OfflineIndicator";
import { useAuthContext } from "./context/AuthContext";
import { FocusProvider } from "./context/FocusContext";
import ReportModal from './components/Map/ReportModal';
import "./index.css";

const MapView = lazy(() => import("./components/Map/MapView"));

function MapLoader() {
  return (
    <div className="map-loader">
      <div className="three-dot-loader">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <p>Loading map...</p>
    </div>
  );
}

export default function App() {
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const [startPoint, setStartPoint] = useState(null);
  const [destPoint, setDestPoint] = useState(null);
  const [startText, setStartText] = useState("");
  const [destText, setDestText] = useState("");
  const [flyTarget, setFlyTarget] = useState(null);
  const [isRecenterZoomed, setIsRecenterZoomed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [markersVisible, setMarkersVisible] = useState(false);
  const [waitingForStart, setWaitingForStart] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [activeProfile, setActiveProfile] = useState("standard");
  const [vehicleMode, setVehicleMode] = useState("walk");
  const [lastLoggedRoute, setLastLoggedRoute] = useState(null);

  const [isRouteLocked, setIsRouteLocked] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [customStartPoint, setCustomStartPoint] = useState(null);
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [isSharedLocation, setIsSharedLocation] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [legendDragProgress, setLegendDragProgress] = useState(0); // 0 = bottom (no blur), 1 = top (full blur)

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedHour, setSelectedHour] = useState(undefined);
  const [mapLayer, setMapLayer] = useState("standard");

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportLocation, setReportLocation] = useState(null);

  // Senior Fix: Graph loading state
  const [graph, setGraph] = useState(null);
  const [graphLoading, setGraphLoading] = useState(true);

  const legendCollapseRef = useRef(null);

  const { location: currentLocation, accuracy, error: locationError, permissionState, requestLocation } = useGeolocation();

  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  const [resetProgressTimestamp, setResetProgressTimestamp] = useState(0); // New state for resetting progress

  // ── Restore route state ──────────────────────────────────────────────────
  useEffect(() => {
    const savedState = loadRouteState();
    if (savedState) {
      if (savedState.startPoint)    setStartPoint(savedState.startPoint);
      if (savedState.destPoint)     setDestPoint(savedState.destPoint);
      if (savedState.startText)     setStartText(savedState.startText);
      if (savedState.destText)      setDestText(savedState.destText);
      if (savedState.markersVisible) setMarkersVisible(savedState.markersVisible);
      if (savedState.activeProfile) setActiveProfile(savedState.activeProfile);
      if (savedState.vehicleMode)   setVehicleMode(savedState.vehicleMode);
      console.log('[App] Restored route state from storage');
      setHasAutoFilled(true); // Skip auto-fill if we restored a valid state
    }
    setIsInitialLoad(false);
  }, []);

  // ── Persist route state ──────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialLoad) return;
    saveRouteState({ startPoint, destPoint, startText, destText, markersVisible, activeProfile, vehicleMode });
  }, [startPoint, destPoint, startText, destText, markersVisible, activeProfile, vehicleMode, isInitialLoad]);

  // ── Shared location from URL ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat    = params.get('lat');
    const lng    = params.get('lng');
    const name   = params.get('name') || "Shared location";

    if (lat && lng) {
      const shared = { lat: parseFloat(lat), lng: parseFloat(lng), name: decodeURIComponent(name) };
      setDestPoint(shared);
      setDestText(shared.name);
      setMarkersVisible(true);
      setIsSharedLocation(true);
      console.log("[App] Shared location loaded:", shared);
    }
  }, []);

  // ── Load graph ───────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[App] Loading road network graph...");
    setGraphLoading(true);
    buildGraph()
      .then((graphData) => {
        if (graphData && Object.keys(graphData.nodes).length > 0) {
          setGraph(graphData);
          console.log("[App] Graph loaded —", Object.keys(graphData.nodes).length, "nodes");
        } else {
          console.error("[App] Failed to load graph data");
        }
        setGraphLoading(false);
      })
      .catch((err) => {
        console.error("[App] Graph loading error:", err);
        setGraphLoading(false);
      });
  }, []);

  // ── Load preferences ─────────────────────────────────────────────────────
  useEffect(() => {
    loadPreferences()
      .then((prefs) => {
        if (!prefs) return;
        if (prefs.activeProfile)        setActiveProfile(prefs.activeProfile);
        if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
        if (prefs.vehicleMode)          setVehicleMode(prefs.vehicleMode);
        if (prefs.showHeatmap !== undefined) setShowHeatmap(prefs.showHeatmap);
        if (prefs.mapLayer)             setMapLayer(prefs.mapLayer);
        console.log("[App] Preferences loaded:", prefs);
      })
      .catch((err) => console.warn("[App] Failed to load preferences:", err));
  }, []);

  // ── Log login + trigger location request ────────────────────────────────
  useEffect(() => {
    if (user && logLogin) logLogin();
  }, [user, logLogin]);

  useEffect(() => {
    if (user && permissionState === "prompt") {
      requestLocation();
    }
  }, [user, permissionState, requestLocation]);

  // ── Save preferences ───────────────────────────────────────────
  useEffect(() => {
    savePreferences({ activeProfile, darkMode, vehicleMode, showHeatmap, mapLayer })
      .catch((err) => console.warn("[App] Failed to save preferences:", err));
  }, [activeProfile, darkMode, vehicleMode, showHeatmap, mapLayer]);

  // ── Sync status bar color with theme ───────────────────────────
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', darkMode ? '#0d0d0d' : '#d0d7e2');
  }, [darkMode]);

  const effectiveStartPoint = useCustomLocation && customStartPoint ? customStartPoint : startPoint;
  const effectiveStartText  = useCustomLocation && customStartPoint
    ? customStartPoint.name || "Custom location"
    : startText;

  // Senior Fix: If 'My current location' is the destination, link it to live GPS
  const isDestCurrentLocation = destText === "My current location";
  const finalDestPoint = isDestCurrentLocation ? currentLocation : destPoint;

  const getNodeId = useCallback((point) => {
    if (!point || !graph) return null;
    if (point.nodeId) return point.nodeId;
    return findNearestNode(graph, point.lat, point.lng);
  }, [graph]);

  const startNodeId = effectiveStartPoint ? getNodeId(effectiveStartPoint) : null;
  const destNodeId  = finalDestPoint       ? getNodeId(finalDestPoint)      : null;

  const {
    primaryRoute,
    alternativeRoutes,
    isLoading: isRouting,
    isRerouting,
    deviationDetected,
    routes,
  } = useRealtimeRoutes({
    graph,
    startNodeId,
    endNodeId:   destNodeId,
    currentLocation,
    activeProfile,
    vehicleMode,
    isActive: markersVisible && !!effectiveStartPoint && !!finalDestPoint,
  });

  // Senior SWE Optimization: Use a local ref to keep track of if the destination changed.
  // If only the profile changed, we don't want to "draw" the route, we just want to update it.
  const prevDestRef = useRef(null);
  const isNewDestination = destPoint?.lat !== prevDestRef.current?.lat;
  
  useEffect(() => {
    prevDestRef.current = destPoint;
  }, [destPoint]);

  // ── Log route ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (markersVisible && primaryRoute && effectiveStartPoint && destPoint) {
      const routeKey = `${effectiveStartPoint.name}-${destPoint.name}-${activeProfile}-${vehicleMode}-${primaryRoute.totalDistanceKm}`;
      if (lastLoggedRoute !== routeKey) {
        setLastLoggedRoute(routeKey);
        logRouteCalculated(
          effectiveStartPoint.name || 'Unknown start',
          destPoint.name || 'Unknown destination',
          activeProfile,
          primaryRoute.totalDistanceKm
        );
      }
    }
  }, [markersVisible, primaryRoute, effectiveStartPoint, destPoint, activeProfile, vehicleMode]);

  const warnings = primaryRoute?.context?.warnings || [];

  // ── Auto-fill FROM with GPS ───────────────────────────────────────────────
  useEffect(() => {
    if (currentLocation && !hasAutoFilled && !useCustomLocation && !startPoint) {
      setStartPoint(currentLocation);
      setStartText("My current location");
      setHasAutoFilled(true);
    }
  }, [currentLocation, hasAutoFilled, useCustomLocation, startPoint]);

  // ── Lock route when active ────────────────────────────────────────────────
  useEffect(() => {
    if (markersVisible && primaryRoute?.coordinates?.length > 0) {
      setIsRouteLocked(true);
    } else {
      setIsRouteLocked(false);
    }
  }, [markersVisible, primaryRoute]);

  const registerLegendCollapse = useCallback((fn) => {
    legendCollapseRef.current = fn;
  }, []);

  // Coordinated panel management
  const [isPanelTransitioning, setIsPanelTransitioning] = useState(false);
  
  const handleNavExpandRequest = useCallback((expanded) => {
    if (expanded) {
      // When expanding NavPanel, collapse Legend first (smooth coordination)
      setIsPanelTransitioning(true);
      setIsNavExpanded(true);
      // Allow time for Legend collapse animation
      setTimeout(() => setIsPanelTransitioning(false), 350);
    } else {
      // When collapsing NavPanel, no delay needed
      setIsNavExpanded(false);
    }
  }, []);

  const handleNavPanelClose = useCallback(() => {
    setIsNavExpanded(false);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleUseCurrentLocation = () => {
    if (currentLocation) {
      setStartPoint(currentLocation);
      setStartText("My current location");
      setWaitingForStart(false);
      setUseCustomLocation(false);
      setCustomStartPoint(null);
    } else if (permissionState !== "denied" && permissionState !== "unsupported") {
      setStartPoint(null);
      setStartText("");
      setHasAutoFilled(false);
      setWaitingForStart(false);
      requestLocation();
    }
  };

  const handleUseCustomLocation = () => {
    if (!customStartPoint) return;
    setUseCustomLocation(true);
    setWaitingForStart(false);
  };

  const handleStartSelect = (loc) => {
    setStartPoint(loc);
    setStartText(loc.name);
    setWaitingForStart(false);
    setFlyTarget(loc);
    setUseCustomLocation(false);
    setCustomStartPoint(null);
  };

  const handleDestSelect = (loc) => {
    setDestPoint(loc);
    setDestText(loc.name);
    setFlyTarget(loc);
    logSearch(destText, loc);
  };

  const handleMapClick = useCallback(async (latlng) => {
    // Close NavPanel if it's open (clicking away to dismiss)
    if (isNavExpanded) {
      setIsNavExpanded(false);
      return;
    }

    if (isRouteLocked) {
      if (isLegendExpanded && legendCollapseRef.current) {
        legendCollapseRef.current();
        setIsLegendExpanded(false);
      }
      return;
    }

    const name = await reverseGeocode(latlng.lat, latlng.lng);
    const loc  = { lat: latlng.lat, lng: latlng.lng, name };

    if (waitingForStart) {
      setStartPoint(loc);
      setStartText(name);
      setWaitingForStart(false);
      setUseCustomLocation(false);
      setCustomStartPoint(null);
    } else {
      setDestPoint(loc);
      setDestText(name);
      setIsSharedLocation(false);
      setIsNavExpanded(true);
      logSearch(`Map click at ${latlng.lat}, ${latlng.lng}`, loc);
    }
  }, [waitingForStart, isRouteLocked, isLegendExpanded, isNavExpanded]);

  const handleCustomLocationDragEnd = useCallback(async (e) => {
    const { lat, lng } = e.target.getLatLng();
    const name         = await reverseGeocode(lat, lng);
    const dragged      = { lat, lng, name };
    setCustomStartPoint(dragged);
    setUseCustomLocation(true);
    if (!startPoint && startText === "") {
      setStartPoint(dragged);
      setStartText(name);
    }
  }, [startPoint, startText]);

  const handleShowOnMap = async () => {
    setIsResolving(true);
    let resolvedStart = effectiveStartPoint;
    let resolvedDest  = destPoint;

    if (!resolvedStart && effectiveStartText.trim().length > 0) {
      const results = await geocode(effectiveStartText);
      if (results.length > 0) {
        resolvedStart = results[0];
        if (!useCustomLocation) { setStartPoint(results[0]); setStartText(results[0].name); }
        else                    { setCustomStartPoint(results[0]); }
      }
    }

    if (!resolvedDest && destText.trim().length > 0) {
      const results = await geocode(destText);
      if (results.length > 0) {
        resolvedDest = results[0];
        setDestPoint(results[0]);
        setDestText(results[0].name);
        setIsSharedLocation(false);
      }
    }

    setIsResolving(false);

    if (resolvedStart && resolvedDest) {
      setMarkersVisible(true);
      setFlyTarget(resolvedStart);
    }
  };

  const handleSwap = () => {
    // 1. Force a "Visual Reset" to clear the 'fainted' state and reset progress
    setMarkersVisible(false);
    
    // 2. Clear the destination ref so RouteLayer treats this as a brand new journey
    prevDestRef.current = null;

    // 3. Prevent auto-fill from interfering with the manual user intent
    setHasAutoFilled(true);

    const sP = startPoint;
    const dP = destPoint;
    const sT = startText;
    const dT = destText;

    let newStartPointForFly = null; // This will be the point to fly to

    if (useCustomLocation && customStartPoint) {
      const oldCustom = customStartPoint;
      setDestPoint(oldCustom);
      setDestText(customStartPoint.name || "Custom location");
      
      setCustomStartPoint(sP); // Old start becomes new custom start
      setStartPoint(sP);       // Old start becomes new start
      setStartText(sT);        // Old start text becomes new start text
      setUseCustomLocation(!!sP); // If old start was custom, new custom start is old start
      newStartPointForFly = sP;
    } else {
      // Standard swap logic
      setStartPoint(dP);
      setDestPoint(sP);
      setStartText(dT);
      setDestText(sT);
      setUseCustomLocation(false);
      setCustomStartPoint(null);
      newStartPointForFly = dP; // New start is old dest
    }
    setIsSharedLocation(false);

    // If the new start point is null (e.g., old dest was null),
    // and we have currentLocation, make currentLocation the start.
    if (!newStartPointForFly && currentLocation) {
      setStartPoint(currentLocation);
      setStartText("My current location");
      newStartPointForFly = currentLocation;
    }

    // ── Senior Fix: Google Maps Style Transition ──
    // 1. Update camera to the new starting point we just assigned
    if (newStartPointForFly) {
      setFlyTarget({ ...newStartPointForFly, _t: Date.now() });
    }

    // 2. Re-enable visibility after state settles and signal RouteLayer to reset progress
    setTimeout(() => {
      setMarkersVisible(true);
      setResetProgressTimestamp(Date.now()); // Signal RouteLayer to reset progress
    }, 100); // Slightly longer delay to ensure all state updates propagate
  };

  const handleReset = () => {
    setDestPoint(null);
    setDestText("");
    setMarkersVisible(false);
    setWaitingForStart(false);
    setUseCustomLocation(false);
    setCustomStartPoint(null);
    setIsSharedLocation(false);
    setIsRouteLocked(false);
    setIsNavExpanded(false);
    clearRouteState();
    console.log("[App] Route cleared");
    if (currentLocation) {
      setStartPoint(currentLocation);
      setStartText("My current location");
      setFlyTarget({ ...currentLocation, _t: Date.now() });
    } else {
      setStartPoint(null);
      setStartText("");
    }
  };

  const handleRecenter = () => {
    if (!currentLocation) return;
    const zoomedIn = !isRecenterZoomed;
    setIsRecenterZoomed(zoomedIn);
    setFlyTarget({ ...currentLocation, zoom: zoomedIn ? 17 : 13, _t: Date.now() });
  };

  // ── Report modal handlers ────────────────────────────────────────────────
  const handleOpenReportModal = useCallback(() => {
    // Senior Fix: No direct DOM queries. Use currentLocation or UG Center.
    const defaultLocation = currentLocation 
      ? { lat: currentLocation.lat, lng: currentLocation.lng, name: "My location" }
      : { lat: 5.6502, lng: -0.1962, name: "Campus center" };
    
    setReportLocation(defaultLocation);
    setIsReportModalOpen(true);
  }, [currentLocation]);

  const handleCloseReportModal = () => {
    setIsReportModalOpen(false);
    setReportLocation(null);
  };

  const handleSubmitReport = async (reportData) => {
    console.log('[App] Submitting report:', reportData);
    setIsReportModalOpen(false);
    setReportLocation(null);
  };

  const canShow =
    (effectiveStartPoint || effectiveStartText.trim().length > 0) &&
    (destPoint           || destText.trim().length > 0);

  // Compute map blur state
  // Senior Fix: Keep map in focus during legend interaction. Only blur for search.
  const isMapBlurred = isNavExpanded;

  return (
    <FocusProvider>
      <ErrorBoundary>
        <OfflineIndicator />
        <div className={`ug-root${darkMode ? " dark" : ""}`}>
        <NavPanel
          startText={effectiveStartText}
          destText={destText}
          onStartTextChange={setStartText}
          onDestTextChange={setDestText}
          onStartSelect={handleStartSelect}
          onDestSelect={handleDestSelect}
          onUseCurrentLocation={handleUseCurrentLocation}
          onSwap={handleSwap}
          onShowOnMap={handleShowOnMap}
          onReset={handleReset}
          hasCurrentLocation={!!currentLocation || (permissionState !== "denied" && permissionState !== "unsupported")}
          canShow={canShow}
          isResolving={isResolving || isRouting}
          markersVisible={markersVisible}
          accuracy={accuracy}
          activeProfile={activeProfile}
          locationError={locationError}
          isExpanded={isNavExpanded}
          onExpandRequest={handleNavExpandRequest}
        />

        <Suspense fallback={<MapLoader />}>
          <MapView
            currentLocation={currentLocation}
            accuracy={accuracy}
            customStartPoint={customStartPoint}
            startPoint={effectiveStartPoint}
            destPoint={finalDestPoint} // Ensure MapLibre3DView uses finalDestPoint
            startText={effectiveStartText}
            destText={destText}
            markersVisible={markersVisible}
            flyTarget={flyTarget}
            darkMode={darkMode}
            mapLayer={mapLayer}
            onMapLayerChange={setMapLayer}
            waitingForStart={waitingForStart}
            primaryRoute={primaryRoute}
            alternativeRoutes={alternativeRoutes}
            allRoutes={routes}
            isRouting={isRouting}
            isRerouting={isRerouting}
            deviationDetected={deviationDetected}
            warnings={warnings}
            activeProfile={activeProfile}
            vehicleMode={vehicleMode}
            useCustomLocation={useCustomLocation}
            isSharedLocation={isSharedLocation}
            isLegendExpanded={isLegendExpanded}
            onLegendExpandedChange={setIsLegendExpanded}
            onProfileChange={setActiveProfile}
            onVehicleModeChange={setVehicleMode}
            onMapClick={handleMapClick}
            onCustomLocationDragEnd={handleCustomLocationDragEnd}
            onRecenter={handleRecenter}
            isRecenterZoomed={isRecenterZoomed}
            isRouteLocked={isRouteLocked}
            registerLegendCollapse={registerLegendCollapse}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => {
              setShowHeatmap(h => !h);
              if (!showHeatmap) {
                const hh = new Date().getHours();
                setSelectedHour(
                  hh >= 6 && hh <= 9 ? 8 :
                  hh >= 10 && hh <= 14 ? 12 :
                  hh >= 15 && hh <= 17 ? 16 :
                  hh >= 18 && hh <= 21 ? 19 : 22
                );
              }
            }}
            selectedHour={selectedHour}
            onSelectedHourChange={setSelectedHour}
            onOpenReportModal={handleOpenReportModal}
            isNavExpanded={isNavExpanded}
            onNavPanelClose={handleNavPanelClose}
            isNewDestination={isNewDestination}
            isPanelTransitioning={isPanelTransitioning}
            isMapBlurred={isMapBlurred}
            legendDragProgress={legendDragProgress}
            onLegendDragProgressChange={setLegendDragProgress}
          />
        </Suspense>

        <ReportModal
          isOpen={isReportModalOpen}
          onClose={handleCloseReportModal}
          onSubmit={handleSubmitReport}
          defaultLocation={reportLocation}
          user={user}
        />
      </div>
    </ErrorBoundary>
    </FocusProvider>
  );
}