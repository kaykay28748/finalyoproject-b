// hooks/useRealtimeRoutes.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getAllRoutes, findNearestNode } from "../services/routing";
import { getDistanceToRoute, distanceBetween, findClosestPointOnRoute } from "../function/utils/geometry";
import { logRouteSegments, resetHeatmapSession } from "../services/heatmapAnalytics";
import { useVoiceGuidance } from "./useVoiceGuidance";

const DEVIATION_THRESHOLD_METERS  = 45;
const REROUTE_DEBOUNCE_MS         = 2000;
const MIN_POSITION_CHANGE_METERS  = 8;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;
const NEAREST_NODE_MAX_DISTANCE_DEG = 0.005;

export const ROUTE_PROFILES = {
  standard:   { key: "standard",   label: "Standard",     icon: "🗺️", color: "#2563eb", description: "Balanced route — shortest with basic safety" },
  fastest:    { key: "fastest",    label: "Fastest",      icon: "⚡", color: "#22c55e", description: "Pure shortest path — ignores comfort factors" },
  accessible: { key: "accessible", label: "Accessible",   icon: "♿", color: "#8b5cf6", description: "Avoids steep inclines and unpaved surfaces" },
  night:      { key: "night",      label: "Night Safety", icon: "🌙", color: "#f59e0b", description: "Prioritises well-lit, busy roads" },
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
      // Fetch all profiles in parallel (handled by services/routing)
      const allRoutes = await getAllRoutes(graph, fromNodeId, endNodeId, activeProfile, vehicleMode);
      
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

      const routeToLog = allRoutes?.standard ?? allRoutes?.fastest;
      if (routeToLog?.coordinates?.length) logRouteSegments(routeToLog.coordinates);

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
    return routes[activeProfile];
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