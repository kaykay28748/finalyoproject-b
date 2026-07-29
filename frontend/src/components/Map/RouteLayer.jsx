// components/Map/RouteLayer.jsx

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Polyline, Marker } from "react-leaflet";
import L from "leaflet";
import { ROUTE_COLORS } from "../../function/utils/colors";
import { useVoiceGuidance } from "../../hooks/useVoiceGuidance";
import { useHaptics } from "../../hooks/useHaptics";
import { useFocus } from "../../context/FocusContext";
import { useSmoothRoutePosition } from "../../hooks/useSmoothRoutePosition";
import { generateDirections } from "../../services/directions";
import { findClosestPointOnRoute } from "../../function/utils/geometry";
import "./RouteLayer.css";

const MIN_DURATION_MS = 800;
const MAX_DURATION_MS = 2000;

function getAnimationDuration(totalPoints) {
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, MIN_DURATION_MS + totalPoints * 8));
}

function findClosestRouteIndexOptimized(coordinates, currentLocation, thresholdMeters = 50) {
  if (!coordinates?.length || !currentLocation) return -1;

  let closestIndex = -1;
  let minDistance  = Infinity;
  const step = Math.max(1, Math.floor(coordinates.length / 50));

  for (let i = 0; i < coordinates.length; i += step) {
    const p = coordinates[i];
    const d = Math.sqrt((p.lat - currentLocation.lat) ** 2 + (p.lng - currentLocation.lng) ** 2) * 111319;
    if (d < minDistance) { minDistance = d; closestIndex = i; }
  }

  const startIdx = Math.max(0, closestIndex - step);
  const endIdx   = Math.min(coordinates.length, closestIndex + step);
  for (let i = startIdx; i < endIdx; i++) {
    const p = coordinates[i];
    const d = Math.sqrt((p.lat - currentLocation.lat) ** 2 + (p.lng - currentLocation.lng) ** 2) * 111319;
    if (d < minDistance) { minDistance = d; closestIndex = i; }
  }

  return minDistance <= thresholdMeters ? closestIndex : -1;
}

const TURN_THRESHOLDS = [200, 100, 50];

export default function RouteLayer({
  route,
  visible = true,
  profile = "standard",
  currentLocation = null,
  showProgress = true,
  isRecalculating = false,
  resetProgressTimestamp = 0,
  onTurnApproach = null,
  onRouteDirectionChange = null,
  onArrivalSummary = null,
}) {
  const [displayedCoords,    setDisplayedCoords]    = useState([]);
  const [completedCoords,    setCompletedCoords]    = useState([]);
  const [remainingCoords,    setRemainingCoords]    = useState([]);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const [animationProgress,  setAnimationProgress]  = useState(0);
  const [instructions,       setInstructions]       = useState([]);
  const [hasAnnouncedArrival, setHasAnnouncedArrival] = useState(false);
  const [routeDirection, setRouteDirection] = useState(0);
  const [hoveredAlt, setHoveredAlt] = useState(null);

  const animationRef          = useRef(null);
  const lastCompletedIndexRef = useRef(-1);
  const updateTimeoutRef      = useRef(null);
  const startTimeRef          = useRef(null);
  const progressIntervalRef   = useRef(null);

  const announcedTurnsRef = useRef(new Map());

  const mainColor = ROUTE_COLORS[profile] || ROUTE_COLORS.standard;
  const completedColor = "#94a3b8";
  const remainingColor = mainColor;

  const { isVoiceEnabled, speakTurn, speakArrival } = useVoiceGuidance();
  const { trigger } = useHaptics();
  const focus = useFocus();

  // Use smooth position hook
  const { position: smoothPosition, index: smoothIndex, progressRatio } = useSmoothRoutePosition(
    route?.coordinates,
    currentLocation,
    visible && showProgress
  );

  // Generate directions
  useEffect(() => {
    if (!visible || !route?.coordinates?.length) {
      setInstructions([]);
      announcedTurnsRef.current = new Map();
      setHasAnnouncedArrival(false);
      return;
    }
    const dirs = generateDirections(route.coordinates, route.roadNames || []);
    setInstructions(dirs);
    announcedTurnsRef.current = new Map();
    setHasAnnouncedArrival(false);
  }, [route, visible]);

  // Senior Fix: Reset internal progress when requested (e.g., after a swap)
  useEffect(() => {
    if (resetProgressTimestamp > 0) {
      lastCompletedIndexRef.current = -1;
      setCompletedCoords([]);
      setRemainingCoords([]);
      // We don't reset isAnimationComplete here, as the route drawing useEffect handles it.
    }
  }, [resetProgressTimestamp]);

  // Dynamic destination pulse speed based on remaining distance
  const haloDuration = useMemo(() => {
    if (!remainingCoords.length || !isAnimationComplete) return "2.2s";
    
    // Calculate approximate distance based on remaining points 
    // (Assuming ~5-10 meters between points in your graph)
    const approxDist = remainingCoords.length * 7; 
    
    // Scale duration: 500m+ away = 2.2s pulse, 0m away = 0.5s pulse
    const duration = Math.max(0.5, Math.min(2.2, approxDist / 230));
    
    return `${duration.toFixed(2)}s`;
  }, [remainingCoords, isAnimationComplete]);

  // Update segments based on smooth index or route profile changes
  useEffect(() => {
    if (!visible || !route?.coordinates?.length || !showProgress || smoothIndex === undefined) return;

    // If animating, keep displayedCoords as the source of truth
    // Once animation is complete, switch to the split segment view
    if (!isAnimationComplete) return;

    // Senior Fix: Temporarily cap progress at 0 after a swap to allow the line to draw.
    // This prevents the route from immediately appearing "completed" if currentLocation
    // is near the new destination.
    const RESET_DELAY_MS = 1000; // How long to cap progress after a swap
    const isRecentlyReset = (Date.now() - resetProgressTimestamp) < RESET_DELAY_MS;

    let effectiveSmoothIndex = Math.floor(smoothIndex);
    if (isRecentlyReset && effectiveSmoothIndex > 0) {
        effectiveSmoothIndex = 0; // Force progress to 0 if recently reset
    }

    const safeIndex = Math.max(0, Math.min(effectiveSmoothIndex, route.coordinates.length - 1));
    
    // Only update if the index has actually moved forward or if it's the first update after animation
    if (safeIndex > lastCompletedIndexRef.current || lastCompletedIndexRef.current === -1) {
      lastCompletedIndexRef.current = safeIndex;
    }
    
    const coords = route.coordinates.map(c => [c.lat, c.lng]);
    setCompletedCoords(coords.slice(0, lastCompletedIndexRef.current + 1));
    setRemainingCoords(coords.slice(lastCompletedIndexRef.current));

    // Important: Update displayedCoords too so the "main" line is ready 
    // if the system falls back to it during transitions
    setDisplayedCoords(coords);

  }, [smoothIndex, route, visible, showProgress, isAnimationComplete]);

  // Calculate route direction from smooth position for arrow
  useEffect(() => {
    if (!route?.coordinates?.length || !smoothPosition || !showProgress) return;
    
    const smoothIdx = smoothIndex;
    const nextIdx = Math.min(Math.floor(smoothIdx) + 1, route.coordinates.length - 1);
    
    if (nextIdx > Math.floor(smoothIdx)) {
      const currentPoint = route.coordinates[Math.floor(smoothIdx)];
      const nextPoint = route.coordinates[nextIdx];
      
      const lat1 = currentPoint.lat * Math.PI / 180;
      const lat2 = nextPoint.lat * Math.PI / 180;
      const lng1 = currentPoint.lng * Math.PI / 180;
      const lng2 = nextPoint.lng * Math.PI / 180;
      
      const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
      let bearing = Math.atan2(y, x) * 180 / Math.PI;
      bearing = (bearing + 360) % 360;
      
      setRouteDirection(bearing);
      
      if (onRouteDirectionChange) {
        onRouteDirectionChange(bearing);
      }
    }
  }, [smoothPosition, smoothIndex, route, showProgress, onRouteDirectionChange]);

  // Progress monitoring + turn announcements
  useEffect(() => {
    if (!visible || !route?.coordinates?.length || !currentLocation || !isVoiceEnabled) return;

    const checkProgress = () => {
      const posToUse = smoothPosition || currentLocation;
      
      const { distanceFromStart } = findClosestPointOnRoute(
        posToUse.lat,
        posToUse.lng,
        route.coordinates
      );

      const totalDistance = (route.totalDistanceKm ?? route.totalDistance / 1000) * 1000;
      const remaining     = totalDistance - distanceFromStart;

      // Trigger arrival when distance is low AND halo is pulsing at max speed (0.5s)
      if (remaining <= 20 && !hasAnnouncedArrival && parseFloat(haloDuration) <= 0.6) {
        setHasAnnouncedArrival(true);
        trigger([100, 100, 100]);
        speakArrival();
        if (onArrivalSummary) {
          onArrivalSummary({
            totalDistance: totalDistance.toFixed(0),
            profile,
            // Assuming travel time is roughly 1.4m/s walking speed
            estimatedMinutes: Math.ceil(totalDistance / (1.4 * 60))
          });
        }
        return;
      }

      for (let i = 0; i < instructions.length; i++) {
        const turn = instructions[i];
        if (turn.isDestination) continue;

        const distanceToTurn = turn.distance - distanceFromStart;
        if (distanceToTurn < 0) continue;
        if (distanceToTurn > TURN_THRESHOLDS[0] + 20) continue;

        for (const threshold of TURN_THRESHOLDS) {
          if (distanceToTurn <= threshold) {
            const announced = announcedTurnsRef.current.get(i) || new Set();
            if (!announced.has(threshold)) {
              announced.add(threshold);
              announcedTurnsRef.current.set(i, announced);
              const instruction = turn.instruction || 'Continue';
              if (threshold <= 50) trigger([30, 50, 30]);
              speakTurn(instruction, distanceToTurn, threshold <= 50 ? 'immediate' : 'normal');
              break;
            }
          }
        }
      }
    };

    checkProgress();
    progressIntervalRef.current = setInterval(checkProgress, 2000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [currentLocation, smoothPosition, route, visible, isVoiceEnabled, instructions, speakTurn, speakArrival, hasAnnouncedArrival]);

  // Route draw animation — Identifies unique route geometries
  useEffect(() => {
    if (!visible || !route?.coordinates?.length) {
      setDisplayedCoords([]);
      setIsAnimationComplete(false);
      setCompletedCoords([]);
      setRemainingCoords([]);
      setAnimationProgress(0);
      lastCompletedIndexRef.current = -1;
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
      return;
    }

    const start = route.coordinates[0];
    const end = route.coordinates[route.coordinates.length - 1];
    
    // Senior Fix: The signature now includes the specific order of start/end AND profile.
    // A swap or profile switch will now correctly trigger a re-draw animation.
    const routeSignature = `S:${start.lat.toFixed(5)},${start.lng.toFixed(5)}-E:${end.lat.toFixed(5)},${end.lng.toFixed(5)}-P:${profile}`;
    
    // If same signature, skip re-animation
    if (animationRef.current_sig === routeSignature) {
      const coords = route.coordinates.map((c) => [c.lat, c.lng]);
      const idx = Math.max(0, lastCompletedIndexRef.current);
      setCompletedCoords(coords.slice(0, idx + 1));
      setRemainingCoords(coords.slice(idx));
      setDisplayedCoords(coords);
      setIsAnimationComplete(true);
      return;
    }

    // New signature detected (swap or profile switch) -> Full Reset
    setIsAnimationComplete(false);
    lastCompletedIndexRef.current = -1;
    
    animationRef.current_sig = routeSignature;
    const coords   = route.coordinates.map((c) => [c.lat, c.lng]);
    const total    = coords.length;
    const duration = getAnimationDuration(total);

    // Only reset animation state for entirely new destinations
    if (!isAnimationComplete) {
      setDisplayedCoords([]);
      setAnimationProgress(0);
      startTimeRef.current = null;
    }

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed      = timestamp - startTimeRef.current;
      const progress     = Math.min(1, elapsed / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 2);
      setAnimationProgress(easedProgress);

      const pointsToShow = Math.floor(total * easedProgress);

      if (pointsToShow >= total) {
        setDisplayedCoords(coords);
        setIsAnimationComplete(true);
        setAnimationProgress(1);
        animationRef.current = null;
      } else {
        setDisplayedCoords(coords.slice(0, pointsToShow));
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; } };
  }, [route?.coordinates, visible, profile]);

  // Directional beam — bearing from start along initial route segment
  const startBearing = useMemo(() => {
    if (!route?.coordinates?.length || route.coordinates.length < 2) return 0;
    const p0 = route.coordinates[0];
    const p1 = route.coordinates[Math.min(2, route.coordinates.length - 1)];
    const lat1 = p0.lat * Math.PI / 180;
    const lat2 = p1.lat * Math.PI / 180;
    const lng1 = p0.lng * Math.PI / 180;
    const lng2 = p1.lng * Math.PI / 180;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }, [route?.coordinates]);

  // Render nothing if hidden or no data
  const hasAnimationData = displayedCoords.length >= 2;
  const hasNavData = completedCoords.length >= 2 || remainingCoords.length >= 2;

  if (!visible || (!hasAnimationData && !hasNavData)) {
    return null;
  }

  const isRouteFocused = focus.isFocused('route', route?.id);
  const routeFocusClass = `${isRouteFocused ? 'route--focused' : (focus.hasFocus ? 'route--blurred' : '')} ${isRecalculating ? 'route--recalculating' : ''}`;

  if (showProgress && isAnimationComplete && (completedCoords.length > 0 || remainingCoords.length > 0)) {
    return (
      <div style={{ '--profile-color': mainColor }}>
        {completedCoords.length >= 2 && (
          <Polyline
            positions={completedCoords}
            color={completedColor}
            weight={5}
            opacity={isRouteFocused ? 0.5 : 0.4}
            smoothFactor={2}
            lineCap="round"
            lineJoin="round"
            className={`route-completed ${routeFocusClass}`}
          />
        )}
        {remainingCoords.length >= 2 && (
          <>
            <Polyline
              positions={remainingCoords}
              color={mainColor}
            weight={9} // Primary route weight
              opacity={isRouteFocused ? 1 : 0.95}
              smoothFactor={2}
              lineCap="round"
              lineJoin="round"
              className={`route-remaining ${routeFocusClass}`}
              eventHandlers={!isRouteFocused ? { click: () => focus.setFocus('route', route?.id, 'tap') } : {}}
            />
            <Polyline
              positions={remainingCoords}
              color={mainColor}
              weight={14}
              opacity={isRouteFocused ? 0.25 : 0.15}
              smoothFactor={2}
              lineCap="round"
              lineJoin="round"
              className={`route-remaining-glow ${routeFocusClass}`}
            />
            {/* Destination Point Halo Glow */}
            <Marker
              position={[route.coordinates[route.coordinates.length - 1].lat, route.coordinates[route.coordinates.length - 1].lng]}
              icon={L.divIcon({
                className: "dest-halo-container",
                html: `<div class="dest-halo" style="--profile-color: ${mainColor}; --halo-duration: ${haloDuration}"></div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              })}
              interactive={false}
              zIndexOffset={-100}
            />
            {/* Directional Flow Layer */}
            <Polyline
              positions={remainingCoords}
              color="#ffffff"
              weight={3}
              opacity={0.6}
              smoothFactor={2}
              lineCap="round"
              className="route-flow-indicator"
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ '--profile-color': mainColor }}>
      <Polyline
        positions={displayedCoords}
        color={mainColor}
        weight={14}
        opacity={0.1 * Math.min(1, animationProgress * 1.5)}
        smoothFactor={2}
        lineCap="round"
        lineJoin="round"
        className={`route-glow ${routeFocusClass}`}
      />
      <Polyline
        positions={displayedCoords}
        color={mainColor}
        weight={9}
        opacity={0.95}
        smoothFactor={2}
        lineCap="round"
        lineJoin="round"
        className={`${isAnimationComplete ? "route-main route-complete" : "route-main route-animating"} ${routeFocusClass}`}
        eventHandlers={!isRouteFocused ? { click: () => focus.setFocus('route', route?.id, 'tap') } : {}}
      />
    </div>
  );
}