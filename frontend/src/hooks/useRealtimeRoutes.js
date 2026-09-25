// hooks/useRealtimeRoutes.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getAllRoutes, findNearestNode } from "../services/routing";
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

  const { isVoiceEnabled, speakRouteSummary, speakDeviation } = useVoiceGuidance();
  
  const isVoiceEnabledRef = useRef(isVoiceEnabled);
  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  useEffect(() => {
    currentStartNodeIdRef.current = startNodeId;
  }, [startNodeId]);

  const calculateRoutes = useCallback(async (fromNodeId, reason = "initial") => {
    if (!graph || !fromNodeId || !endNodeId) {
      console.warn('[useRealtimeRoutes] Missing graph or node IDs');
      return;
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
    if (isReroute) setIsRerouting(true);
    else           setIsLoading(true);

    lastRerouteTime.current       = now;
    currentStartNodeIdRef.current = fromNodeId;
    lastNodePairRef.current       = `${fromNodeId}-${endNodeId}`;

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

      // Fetch all profiles in parallel (handled by services/routing)
      const allRoutes = await getAllRoutes(graph, fromNodeId, endNodeId, vehicleMode, feed?.reports ?? [], weatherMultipliers);
      
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
    return requested ?? null;
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