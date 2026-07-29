import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import { useVoiceGuidance } from "../../hooks/useVoiceGuidance";
import { useHaptics } from "../../hooks/useHaptics";
import { useWeather } from "../../hooks/useWeather";
import { generateDirections } from "../../services/directions";
import { getApprovedReports } from "../../services/reportService";
import { useDragSheet } from "./hooks/useDragSheet";
import { useRouteMetrics, formatDistance, formatTravelTime } from "./hooks/useRouteMetrics";
import { getGateWarnings, getReportWarnings, getWeatherWarning } from "./utils/getRouteWarnings";
import { getTrafficLabel } from "./utils/getTrafficLabel";
import LegendHeader from "./LegendHeader";
import LegendBody from "./LegendBody";
import LegendDirectionsTab from "./LegendDirectionsTab";
import LegendEmptyState from "./LegendEmptyState";
import LegendProfileBar from "./LegendProfileBar";
import WeatherBanner from "./WeatherBanner";
import "./Legend.css";

const Legend = forwardRef(function Legend({
  visible, route, routeActive = false, activeProfile = "standard",
  vehicleMode = "walk", warnings = [], alternatives = [],
  onSelectAlternative, activeAlternativeIndex = 0, currentLocation,
  onExpandedChange, onProfileChange, onVehicleModeChange,
  autoCollapse = false, disableDrag = false, onNavPanelClose, onDragProgress,
}, ref) {
  const [expanded, setExpanded] = useState(false);
  const [directions, setDirections] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [completedDistance, setCompletedDistance] = useState(0);
  const [approvedReports, setApprovedReports] = useState([]);

  const hasRoute = Boolean(route?.totalDistance);
  const metrics = useRouteMetrics(route, vehicleMode);
  const { isVoiceEnabled, toggleVoice, speak, speakTurn, speakArrival } = useVoiceGuidance();
  const { trigger } = useHaptics();
  const weather = useWeather();
  const headerRef = useRef(null);
  const lastRouteSigRef = useRef(null);
  const lastAnnouncedStepRef = useRef(-1);
  const lastAnnouncedRouteIdRef = useRef(null);
  const prevHasRouteRef = useRef(hasRoute);
  const wasExpandedBeforeCollapse = useRef(true);

  const { sheetRef, handleDragStart, toggleExpanded, initPosition } = useDragSheet({
    expanded, onExpandedChange: setExpanded,
    disableDrag, onDragProgress, onNavPanelClose,
  });

  useEffect(() => { onExpandedChange?.(expanded); }, [expanded, onExpandedChange]);

  useEffect(() => {
    (expanded ? sheetRef : headerRef).current?.focus();
  }, [expanded]);

  useEffect(() => {
    getApprovedReports().then((res) => res?.reports && setApprovedReports(res.reports)).catch(() => {});
  }, []);

  const handleVoiceToggle = useCallback(() => {
    trigger(10);
    toggleVoice();
    if (!isVoiceEnabled && metrics) {
      setTimeout(() => speak(`Route calculated. ${metrics.distance}, about ${metrics.time}.`), 100);
    }
  }, [toggleVoice, isVoiceEnabled, metrics, trigger, speak]);

  const allWarnings = useMemo(() => {
    const w = [...warnings];
    for (const gw of [...getGateWarnings(route, vehicleMode), ...getReportWarnings(route, approvedReports)]) {
      if (!w.some((x) => x.message === gw.message)) w.push(gw);
    }
    const wx = getWeatherWarning(weather, route);
    if (wx && !w.some((x) => x.message === wx.message)) w.push(wx);
    return w;
  }, [warnings, route, vehicleMode, approvedReports, weather]);

  useEffect(() => {
    if (route?.coordinates?.length > 0) {
      setDirections(generateDirections(route.coordinates, route.roadNames || []));
      setCurrentStepIndex(-1);
      lastAnnouncedStepRef.current = -1;
    } else {
      setDirections([]);
      setCurrentStepIndex(-1);
      lastAnnouncedStepRef.current = -1;
    }
  }, [route]);

  useEffect(() => {
    if (!route?.coordinates?.length) { lastRouteSigRef.current = null; return; }
    const start = route.coordinates[0];
    const end = route.coordinates[route.coordinates.length - 1];
    const sig = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}-${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;
    if (lastRouteSigRef.current !== sig) {
      setExpanded(false);
      lastRouteSigRef.current = sig;
    }
  }, [route]);

  useEffect(() => {
    if (hasRoute && !prevHasRouteRef.current && visible) setExpanded(true);
    prevHasRouteRef.current = hasRoute;
  }, [hasRoute, visible]);

  useEffect(() => {
    if (autoCollapse && expanded) {
      wasExpandedBeforeCollapse.current = true;
      setExpanded(false);
    } else if (!autoCollapse && wasExpandedBeforeCollapse.current && !expanded) {
      setExpanded(true);
      wasExpandedBeforeCollapse.current = false;
    }
  }, [autoCollapse]);

  useEffect(() => {
    if (!currentLocation || !route?.coordinates?.length || directions.length === 0) return;
    let minDist = Infinity, closestIndex = 0;
    for (let i = 0; i < route.coordinates.length; i++) {
      const p = route.coordinates[i];
      const d = Math.sqrt((p.lat - currentLocation.lat) ** 2 + (p.lng - currentLocation.lng) ** 2) * 111319;
      if (d < minDist) { minDist = d; closestIndex = i; }
    }
    let distFromStart = 0;
    for (let i = 1; i <= closestIndex; i++) {
      const a = route.coordinates[i - 1], b = route.coordinates[i];
      distFromStart += Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2) * 111319;
    }
    setCompletedDistance(distFromStart);
    for (let i = 0; i < directions.length; i++) {
      if (directions[i].distance > distFromStart || directions[i].isDestination) {
        setCurrentStepIndex(i); break;
      }
    }
  }, [currentLocation, route, directions]);

  useEffect(() => {
    if (!isVoiceEnabled || currentStepIndex < 0 || directions.length === 0) return;
    if (currentStepIndex === lastAnnouncedStepRef.current) return;
    const step = directions[currentStepIndex];
    if (!step) return;
    lastAnnouncedStepRef.current = currentStepIndex;
    if (step.isDestination) speakArrival();
    else speakTurn(step.instruction, Math.max(0, step.distance - completedDistance));
  }, [currentStepIndex, isVoiceEnabled, directions, completedDistance, speakTurn, speakArrival]);

  useEffect(() => {
    if (!isVoiceEnabled || !route?.totalDistance) return;
    const id = `${route.totalDistance}-${route.coordinates?.length ?? 0}`;
    if (lastAnnouncedRouteIdRef.current === id) return;
    lastAnnouncedRouteIdRef.current = id;
    speak(`Route calculated. ${formatDistance(route.totalDistance)}, about ${formatTravelTime(route.totalDistance, vehicleMode)}.`);
  }, [route, isVoiceEnabled, vehicleMode, speak]);

  useImperativeHandle(ref, () => ({
    collapse: () => expanded && setExpanded(false),
    expand: () => !expanded && setExpanded(true),
    isExpanded: () => expanded,
  }), [expanded]);

  useEffect(() => { initPosition(); }, [visible, hasRoute]);

  if (!visible) return null;

  return (
    <div className="legend-root">
      <div
        ref={sheetRef}
        className={`legend-sheet ${expanded ? "legend-sheet--expanded" : "legend-sheet--peek"}`}
        role="dialog"
        tabIndex={-1}
        aria-label={expanded ? "Route details, expanded" : "Route details, collapsed"}
      >
        <div ref={headerRef} tabIndex={-1}>
          <LegendHeader
            expanded={expanded}
            hasRoute={hasRoute}
            routeActive={routeActive}
            vehicleMode={vehicleMode}
            onVehicleModeChange={onVehicleModeChange}
            onDragStart={handleDragStart}
            toggleExpanded={toggleExpanded}
            metrics={metrics}
            activeProfile={activeProfile}
          />
        </div>

        {expanded && (
          <LegendBody>
            {!hasRoute ? (
              <LegendEmptyState routeActive={routeActive} />
            ) : (
              <>
                <div className="legend-metrics-row">
                  <span className="legend-metrics-time">{metrics?.time || formatTravelTime(route?.totalDistance, vehicleMode)}</span>
                  <span className="legend-metrics-dist">{metrics?.distance || formatDistance(route?.totalDistance)}</span>
                  <span className="legend-traffic-text">{getTrafficLabel()}</span>
                </div>
                <WeatherBanner />
                <LegendDirectionsTab
                  directions={directions}
                  currentStepIndex={currentStepIndex}
                  completedDistance={completedDistance}
                  isVoiceEnabled={isVoiceEnabled}
                  onVoiceToggle={handleVoiceToggle}
                  alternatives={alternatives}
                  activeAlternativeIndex={activeAlternativeIndex}
                  onSelectAlternative={onSelectAlternative}
                  currentLocation={currentLocation}
                  hasWarnings={allWarnings.length > 0}
                  warnings={allWarnings}
                  isFallback={route?.isFallback || false}
                  estimatedTime={metrics?.time}
                />
              </>
            )}
          </LegendBody>
        )}
      </div>

      <LegendProfileBar activeProfile={activeProfile} onProfileChange={onProfileChange} />
    </div>
  );
});

export default Legend;
