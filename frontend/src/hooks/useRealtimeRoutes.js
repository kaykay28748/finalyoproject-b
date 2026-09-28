// hooks/useRealtimeRoutes.js
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getAllRoutes, findNearestNode } from "../services/routing";
import { fetchGraphSlice, SANDBOX_CONTEXT } from "../services/graphSliceService";
import { fetchDecisionFeed } from "../services/reportService";
import { fetchWeather, getWeatherMultipliers } from "../services/weatherService";
import { getDistanceToRoute, distanceBetween, findClosestPointOnRoute } from "../function/utils/geometry";
import { resetHeatmapSession } from "../services/heatmapAnalytics";
import { useVoiceGuidance } from "./useVoiceGuidance";

const DEVIATION_THRESHOLD_METERS  = 45;
// Only treat the live GPS as "actively navigating" when it is within this
// distance of the route. A fix far beyond it (e.g. user set a manual campus
// start while physically elsewhere) must NOT trigger reroute/voice churn.
const NAV_ACTIVE_RADIUS_METERS    = 500;
const REROUTE_DEBOUNCE_MS         = 2000;
const MIN_POSITION_CHANGE_METERS  = 8;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;
const NEAREST_NODE_MAX_DISTANCE_DEG = 0.005;

export const ROUTE_PROFILES = {
  standard:   { key: "standard",   label: "Standard",     icon: "🗺️", color: "#2563eb", description: "Balanced route — shortest with basic safety" },
  fastest:    { key: "fastest",    label: "Fastest",      icon: "⚡", color: "#22c55e", description: "Pure shortest path — ignores comfort factors" },
  accessible: { key: "accessible", label: "Accessible",   icon: "♿", color: "#8b5cf6", description: "Avoids steep inclines and unpaved surfaces" },
  night:      { key: "night",      label: "Night Safety", icon: "🌙", color: "#f59e0b", description: "Prefers lit and well-used routes after dark" },
};

function formatDistanceForVoice(meters) {
  if (meters < 1000) return `${Math.round(meters)} meters`;
  return `${(meters / 1000).toFixed(1)} kilometers`;
}

function formatTravelTimeForVoice(meters, vehicleMode) {
  const VOICE_SPEEDS = { walk: 5, car: 30, motorcycle: 25, bicycle: 15, jogging: 10 };
  const speedKmh = VOICE_SPEEDS[vehicleMode] || 5;
  const minutes  = Math.ceil(meters / (speedKmh * 1000 / 60));
  if (minutes < 1)  return "less than 1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hour` : `${h} hour ${m} minutes`;
}

export function useRealtimeRoutes({
  graph,
  startNodeId,
  endNodeId,
  currentLocation,
  activeProfile,
  vehicleMode = 'walk',
  isActive,
}) {
  const [routes,            setRoutes]            = useState({ standard: null, fastest: null, accessible: null, night: null, lastUpdated: 0 });
  const [isLoading,         setIsLoading]         = useState(false);
  const [isRerouting,       setIsRerouting]       = useState(false);
  const [deviationDetected, setDeviationDetected] = useState(false);
  const [decisionFeed,      setDecisionFeed]      = useState([]);
  const [weatherBasis,      setWeatherBasis]      = useState(null);
  const [hazardFeedState,   setHazardFeedState]   = useState("unknown");
  const [routeProgress,     setRouteProgress]     = useState({
    completedDistance: 0, remainingDistance: 0, percentage: 0, closestPointIndex: -1,
  });

  const lastRerouteTime         = useRef(0);
  const lastNodePairRef         = useRef("");
  const lastPositionRef         = useRef(null);
  const deviationTimerRef       = useRef(null);
  const progressUpdateIntervalRef = useRef(null);
  const currentStartNodeIdRef   = useRef(startNodeId);

  const hasSpokenDeviationRef   = useRef(false);

  // ── Adaptive geofenced slicing ─────────────────────────────────────────────
  //
  // `graph` is still a prop and is still authoritative when present: App.jsx
  // builds it from Overpass. The slice is an *enhancement* layered on top, not a
  // replacement, because the backend returns no graph at all on local SQLite dev
  // and the edge tables may not be loaded yet. So:
  //
  //   slice graph available  -> route over it (no Overpass parse needed)
  //   slice graph unavailable -> route over the Overpass `graph` prop
  //
  // Folding the fallback in here is what keeps `calculateRoutes` free of branching
  // and keeps every downstream consumer — progress tracking, voice, the profile
  // switcher — unaware of which graph it is routing over.
  const [sandboxContext, setSandboxContext] = useState(SANDBOX_CONTEXT.CAMPUS);
  const [enforceGpsTracking, setEnforceGpsTracking] = useState(false);
  const [sliceGraph, setSliceGraph] = useState(null);
  const [sliceSource, setSliceSource] = useState('not-requested');
  // Refs, not state: activeGraph is read inside calculateRoutes and must not
  // become a dependency of the useCallback, or a slice arriving would rebuild
  // the callback and re-trigger the initial route effect.
  const activeGraphRef        = useRef(graph);
  const sandboxContextRef     = useRef(SANDBOX_CONTEXT.CAMPUS);

  useEffect(() => {
    activeGraphRef.current = sliceGraph ?? graph;
  }, [sliceGraph, graph]);

  useEffect(() => {
    sandboxContextRef.current = sandboxContext;
  }, [sandboxContext]);

  // Fetch the slice once per meaningful location change. Keyed on a coarse grid
  // so ordinary GPS jitter does not re-request; the geofence verdict cannot
  // change within a few metres anyway, and re-requesting per metre would hammer
  // the endpoint while walking.
  const sliceRequestKeyRef = useRef('');
  useEffect(() => {
    const lat = currentLocation?.lat;
    const lng = currentLocation?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // ~1.1km grid. Coarser than the 2km slice, so the slice always covers the
    // request point even after the user walks a short distance.
    const key = `${Math.round(lat * 100) / 100}:${Math.round(lng * 100) / 100}`;
    if (key === sliceRequestKeyRef.current) return;
    sliceRequestKeyRef.current = key;

    const controller = new AbortController();
    let cancelled = false;

    fetchGraphSlice(lat, lng, { signal: controller.signal })
      .then((slice) => {
        if (cancelled) return;
        setSandboxContext(slice.sandboxContext);
        setEnforceGpsTracking(slice.enforceGpsTracking);
        setSliceGraph(slice.graph);
        setSliceSource(slice.source);
      })
      .catch(() => {
        // fetchGraphSlice already swallows its own errors; this is belt-and-braces
        // so a thrown rejection can never leave the hook in a broken state.
        if (!cancelled) setSliceSource('fetch-failed');
      });

    return () => { cancelled = true; controller.abort(); };
  }, [currentLocation?.lat, currentLocation?.lng]);

  const { isVoiceEnabled, speakRouteSummary, speakDeviation } = useVoiceGuidance();
  
  const isVoiceEnabledRef = useRef(isVoiceEnabled);
  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  useEffect(() => {
    currentStartNodeIdRef.current = startNodeId;
  }, [startNodeId]);

  const calculateRoutes = useCallback(async (fromNodeId, reason = "initial") => {
    // Route over the slice graph when we have one, else the Overpass graph.
    // `let`, not `const`: the fallbacks below reassign it back to the Overpass
    // graph when the slice cannot serve the requested endpoints.
    let activeGraph = activeGraphRef.current;
    if (!activeGraph || !fromNodeId || !endNodeId) {
      console.warn('[useRealtimeRoutes] Missing graph or node IDs');
      return;
    }

    // The node IDs arrive from App.jsx, which snapped them against the OVERPASS
    // graph. They are meaningless in a slice graph — different node table, so
    // findShortestPath returns null with "Start or end node not found" and the
    // user gets no route at all. So when the two graphs differ, re-snap by
    // coordinate against the graph actually being routed over.
    let startId = fromNodeId;
    let endId = endNodeId;

    if (activeGraph !== graph) {
      const startCoord = graph?.nodes?.[fromNodeId];
      const endCoord   = graph?.nodes?.[endNodeId];

      if (!startCoord || !endCoord) {
        // The Overpass graph no longer has the node we were handed, so there is no
        // coordinate to re-snap from. Fall back rather than route over nothing.
        console.warn('[useRealtimeRoutes] Cannot re-snap onto slice graph, using Overpass graph');
        activeGraphRef.current = graph;
        activeGraph = graph;
      } else {
        const startSnap = findNearestNode(activeGraph, startCoord.lat, startCoord.lng);
        const endSnap   = findNearestNode(activeGraph, endCoord.lat, endCoord.lng);
        if (!startSnap || !endSnap) {
          // The slice does not cover the requested endpoints. findNearestNode
          // returns null past its max distance, which is the signal for this.
          console.warn('[useRealtimeRoutes] Slice graph does not cover the endpoints, using Overpass graph');
          activeGraphRef.current = graph;
          activeGraph = graph;
        } else {
          startId = startSnap;
          endId = endSnap;
        }
      }
    }

    const now = Date.now();
    if (now - lastRerouteTime.current < 800 && reason === "deviation") {
      console.log('[useRealtimeRoutes] Skipping reroute (too soon)');
      return;
    }

    console.log('[useRealtimeRoutes] Calculating all profiles:', { 
      reason, 
      fromNodeId, 
      vehicleMode
    });

    const isReroute = reason !== "initial";

    // A slice swap is not a reroute in the user's sense — they did not move and
    // nothing was blocked. Using the isRerouting flag here would show the
    // "recalculating" indicator and suppress the deviation check for what is
    // really just a background data swap, and the slice normally arrives seconds
    // after the initial route, so a spinner would flash for no reason.
    const isSliceSwap = reason === "slice";
    if (isSliceSwap) setIsLoading(false);
    else if (isReroute) setIsRerouting(true);
    else setIsLoading(true);

    lastRerouteTime.current       = now;
    currentStartNodeIdRef.current = startId;
    lastNodePairRef.current       = `${startId}-${endId}`;

    if (reason === "initial") resetHeatmapSession();

    try {
      // Part B: consume verdicts, never raw reports. Feed is server-cached 30s.
      // A failure must not silently drop every hazard penalty while the UI still
      // advertises a hazard-aware profile — record it so the route can disclose it.
      const feed = await fetchDecisionFeed().catch(() => null);
      setDecisionFeed(feed?.reports ?? []);
      setHazardFeedState(feed ? "live" : "unavailable");

      // Weather participates in the cost function. Shares the 10-min localStorage
      // cache with the banner, so the claim shown and the route computed agree.
      // A failure here must never block routing — fall back to no adjustment.
      const weather = await fetchWeather().catch(() => null);
      const weatherMultipliers = getWeatherMultipliers(weather);
      setWeatherBasis({
        applied:  weatherMultipliers.message !== null,
        fallback: Boolean(weather?.isFallback),
        message:  weatherMultipliers.message,
      });

      // Fetch all profiles in parallel (handled by services/routing).
      // sandboxContextRef is passed by reference on purpose: it is current at call
      // time without making calculateRoutes re-create whenever the slice lands.
      const allRoutes = await getAllRoutes(
        activeGraph,
        startId,
        endId,
        vehicleMode,
        feed?.reports ?? [],
        weatherMultipliers,
        sandboxContextRef.current
      );
      
      setRoutes({ ...allRoutes, lastUpdated: now });
      setDeviationDetected(false);
      hasSpokenDeviationRef.current = false;

      setRouteProgress({
        completedDistance: 0,
        remainingDistance: (allRoutes[activeProfile]?.totalDistanceKm ?? 0) * 1000,
        percentage: 0,
        closestPointIndex: -1,
      });

      if (allRoutes[activeProfile] && isVoiceEnabledRef.current) {
        const dist = formatDistanceForVoice(allRoutes[activeProfile].totalDistance);
        const time = formatTravelTimeForVoice(allRoutes[activeProfile].totalDistance, vehicleMode);
        speakRouteSummary(dist, time, isReroute);
      }


    } catch (err) {
      console.error("[Routes] Calculation failed:", err);
    } finally {
      setIsLoading(false);
      setIsRerouting(false);
    }
  }, [graph, endNodeId, vehicleMode, speakRouteSummary]);

  const updateRouteProgress = useCallback(() => {
    const activeRoute = routes[activeProfile];
    if (!isActive || !currentLocation || !activeRoute?.coordinates?.length || isRerouting) return;

    const { lat, lng } = currentLocation;
    const { closestIndex, distanceFromStart } = findClosestPointOnRoute(lat, lng, activeRoute.coordinates);
    const totalDistance = (activeRoute.totalDistanceKm ?? 0) * 1000;
    const completed     = distanceFromStart;
    const remaining     = Math.max(0, totalDistance - completed);
    const percentage    = totalDistance > 0 ? (completed / totalDistance) * 100 : 0;

    setRouteProgress(prev => {
      if (Math.abs(prev.completedDistance - completed) < 10) return prev;
      return { completedDistance: completed, remainingDistance: remaining, percentage, closestPointIndex: closestIndex, distanceToRoute: 0 };
    });
  }, [routes, activeProfile, isActive, currentLocation, isRerouting]);

  // Initial route calculation
  useEffect(() => {
    if (startNodeId && endNodeId && graph) {
      calculateRoutes(startNodeId, "initial");
    }
  }, [startNodeId, endNodeId, graph, calculateRoutes]);

  // Recalculate once a server slice arrives.
  //
  // Without this the slice would be fetched, stored, and then never used: the
  // effect above keys on `graph`, and `graph` does not change when a slice lands.
  //
  // `sliceGraph` is a dependency on purpose — that is the trigger — but the call
  // is guarded so it only fires on a genuine arrival, not on every re-render of
  // the same graph. A no-op reroute is user-visible: it resets progress to zero
  // and re-speaks the route summary through voice guidance.
  const lastReroutedSliceRef = useRef(null);
  useEffect(() => {
    if (!sliceGraph || !startNodeId || !endNodeId) return;
    if (lastReroutedSliceRef.current === sliceGraph) return;
    lastReroutedSliceRef.current = sliceGraph;
    calculateRoutes(startNodeId, "slice");
  }, [sliceGraph, startNodeId, endNodeId, calculateRoutes]);

  // Progress interval
  useEffect(() => {
    if (isActive && routes[activeProfile] && currentLocation) {
      updateRouteProgress();
      if (progressUpdateIntervalRef.current) clearInterval(progressUpdateIntervalRef.current);
      progressUpdateIntervalRef.current = setInterval(updateRouteProgress, PROGRESS_UPDATE_INTERVAL_MS);
    } else {
      if (progressUpdateIntervalRef.current) { clearInterval(progressUpdateIntervalRef.current); progressUpdateIntervalRef.current = null; }
    }
    return () => { if (progressUpdateIntervalRef.current) clearInterval(progressUpdateIntervalRef.current); };
  }, [isActive, routes, activeProfile, currentLocation, updateRouteProgress]);

  // Clear route data when deactivated so stale state doesn't persist
  useEffect(() => {
    if (!isActive) {
      setRoutes({ standard: null, fastest: null, accessible: null, night: null, lastUpdated: 0 });
      setRouteProgress({ completedDistance: 0, remainingDistance: 0, percentage: 0, closestPointIndex: -1 });
      setDeviationDetected(false);
      setDecisionFeed([]);
    }
  }, [isActive]);

  // Deviation detection
  useEffect(() => {
    if (!isActive || !currentLocation || !routes[activeProfile] || !graph || !endNodeId) return;

    const activeRoute = routes[activeProfile];
    if (!activeRoute?.coordinates?.length) return;

    const { lat, lng } = currentLocation;
    
    if (lastPositionRef.current) {
      const moved = distanceBetween(lat, lng, lastPositionRef.current.lat, lastPositionRef.current.lng);
      if (moved < MIN_POSITION_CHANGE_METERS) return;
    }
    lastPositionRef.current = { lat, lng };

    const distanceToRoute = getDistanceToRoute(lat, lng, activeRoute.coordinates);

    // Live-GPS navigation guard: if the fix is far beyond the route, the user
    // has a manual start elsewhere (e.g. on-campus while physically at home)
    // and is NOT actively navigating — skip deviation handling entirely.
    if (distanceToRoute > NAV_ACTIVE_RADIUS_METERS) return;

    if (distanceToRoute > DEVIATION_THRESHOLD_METERS) {
      if (!deviationDetected) setDeviationDetected(true);

      if (isVoiceEnabledRef.current && !hasSpokenDeviationRef.current) {
        hasSpokenDeviationRef.current = true;
        speakDeviation();
      } else if (!isVoiceEnabledRef.current && !hasSpokenDeviationRef.current) {
        hasSpokenDeviationRef.current = true;
      }

      if (deviationTimerRef.current) clearTimeout(deviationTimerRef.current);

      deviationTimerRef.current = setTimeout(async () => {
        const nearestNode = findNearestNode(graph, lat, lng, NEAREST_NODE_MAX_DISTANCE_DEG);

        if (nearestNode && nearestNode !== currentStartNodeIdRef.current) {
          await calculateRoutes(nearestNode, "deviation");
        } else if (!nearestNode) {
          console.warn("[Deviation] No nearest node found, using fallback");
          await calculateRoutes(currentStartNodeIdRef.current, "deviation");
        }
        deviationTimerRef.current = null;
      }, REROUTE_DEBOUNCE_MS);

    } else {
      if (deviationDetected) {
        setDeviationDetected(false);
        hasSpokenDeviationRef.current = false;
      }
      if (deviationTimerRef.current) { clearTimeout(deviationTimerRef.current); deviationTimerRef.current = null; }
    }

    return () => { if (deviationTimerRef.current) clearTimeout(deviationTimerRef.current); };
  }, [currentLocation, routes, activeProfile, graph, endNodeId, calculateRoutes, deviationDetected, isActive, speakDeviation]);

  const getPrimaryRoute = useCallback(() => {
    // Route guard (Part B): never present an unusable route as primary.
    const requested = routes[activeProfile];
    if (requested?.usable !== false) return requested ?? null;
    for (const profile of ["standard", "fastest", "accessible", "night"]) {
      if (routes[profile]?.usable !== false) return routes[profile];
    }
    // Every candidate is blocked. Returning `requested` keeps a map on screen
    // rather than blanking it, but it is a route through a signed-off hazard —
    // so routeGuardNotice below reports it rather than presenting it as normal.
    return requested ?? null;
  }, [routes, activeProfile]);

  /**
   * Surfaces the route guard to the user instead of applying it silently.
   *
   * getPrimaryRoute() swapping profiles is invisible by construction: the user
   * asked for a route and gets a different one with no indication anything was
   * wrong. And in the all-blocked case the blocked route is returned anyway. Both
   * are the guard working, but neither tells the walker that a hazard they may have
   * reported is affecting the path they are about to walk — which is the one piece
   * of information that makes the remaining route trustworthy.
   *
   * Returns null when the guard had nothing to do.
   */
  const routeGuardNotice = useMemo(() => {
    const requested = routes[activeProfile];
    if (!requested?.coordinates?.length) return null;

    const blocked = requested.usable === false;
    const servedByDemotion = !blocked && activeProfile !== "standard" &&
      routes.standard?.coordinates?.length && requested !== routes.standard &&
      (requested.decisions?.primary === "avoid" || requested.decisions?.incidents?.length);

    if (!blocked && !servedByDemotion) return null;

    const block = requested.decisions?.incidents?.find((d) => d.verdict === "block");

    return {
      type: blocked ? "block" : "warn",
      icon: blocked ? "\u26D4" : "\u26A0\uFE0F",
      message: blocked
        ? `All routes pass a hazard near ${block?.location_name || "your route"}. Showing the least-bad path \u2014 please check ${block?.issue_type || "the area"} before setting off.`
        : `Switched from ${ROUTE_PROFILES[activeProfile]?.label || activeProfile} because it passes a reported hazard.`,
      decision: block ?? requested.decisions?.incidents?.[0] ?? null,
    };
  }, [routes, activeProfile]);
  
  const getAlternativeRoutes = useCallback(() => {
    const primaryRoute = routes[activeProfile];
    const alternatives = [];
    for (const profile of ["standard", "fastest", "accessible", "night"]) {
      if (profile === activeProfile || !routes[profile]?.coordinates?.length) continue;
      const routeB = routes[profile];
      const isIdentical = primaryRoute &&
        primaryRoute.totalDistance    === routeB.totalDistance &&
        primaryRoute.coordinates.length === routeB.coordinates.length;
      if (!isIdentical) alternatives.push({ profile, route: routeB, config: ROUTE_PROFILES[profile] });
    }
    return alternatives;
  }, [routes, activeProfile]);

  return {
    routes,
    decisionFeed,
    weatherBasis,
    hazardFeedState,
    // Adaptive geofenced slicing state. `enforceGpsTracking` is the flag the
    // sandbox uses to require a real GPS fix instead of accepting a typed
    // address; exposed so the UI can reflect it rather than assume campus rules.
    sandboxContext,
    enforceGpsTracking,
    graphSource: sliceGraph ? sliceSource : 'overpass',
    routeGuardNotice,
    primaryRoute:       getPrimaryRoute(),
    alternativeRoutes:  getAlternativeRoutes(),
    isLoading,
    isRerouting,
    deviationDetected,
    lastRouteUpdate: routes.lastUpdated,
    routeProgress,
    refreshRoutes: () => { if (startNodeId && endNodeId) calculateRoutes(startNodeId, "manual"); },
  };
}