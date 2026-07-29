// components/Legend/Legend.jsx

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  IconMap,
  IconAccessibility,
  IconMoon,
  IconBolt,
  IconWalk,
  IconCar,
  IconRuler,
  IconShare,
  IconWarning,
  IconInfo,
  IconBicycle,
  IconJog,
  IconFlame,
  IconMountain,
  IconSteps,
  IconRoad,
  IconChartBar,
  IconDirections,
  IconArrowsRightLeft,
  IconSpeakerWave,
} from "../ui/icon";
import { useVoiceGuidance } from "../../hooks/useVoiceGuidance";
import { useHaptics } from "../../hooks/useHaptics";
import { useFocus } from "../../context/FocusContext";
import { generateDirections } from "../../services/directions";
import WeatherBanner from "./WeatherBanner";
import { fetchHeatmapData } from "../../services/heatmapAnalytics";
import "./Legend.css";
import "./LegendProfile.css";

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatTravelTime(meters, vehicleMode = "walk") {
  const MODE_SPEEDS = {
    walk: 5,
    car: 30,
    motorcycle: 25,
    bicycle: 15,
    jogging: 10,
  };
  const speedKmh = MODE_SPEEDS[vehicleMode] || 5;

  const minutes = Math.ceil(meters / ((speedKmh * 1000) / 60));
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const DirectionIcon = {
  start: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 6 12 18" />
      <polygon points="8 10 12 6 16 10" />
    </svg>
  ),
  straight: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="4" x2="12" y2="20" />
      <polyline points="16 16 12 20 8 16" />
    </svg>
  ),
  "slight-right": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 L14 17 L14 10" />
      <path d="M14 17 L19 12 L14 7" />
    </svg>
  ),
  "turn-right": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 19 L5 11 L14 11" />
      <path d="M10 6 L14 11 L10 16" />
    </svg>
  ),
  "sharp-right": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 19 L5 9 L15 9" />
      <polyline points="11 5 15 9 11 13" />
    </svg>
  ),
  "slight-left": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 17 L10 17 L10 10" />
      <path d="M10 17 L5 12 L10 7" />
    </svg>
  ),
  "turn-left": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 19 L19 11 L10 11" />
      <path d="M14 6 L10 11 L14 16" />
    </svg>
  ),
  "sharp-left": () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 19 L19 9 L9 9" />
      <polyline points="13 5 9 9 13 13" />
    </svg>
  ),
  destination: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" fill="#22c55e" />
    </svg>
  ),
};

function getFallbackArrow(maneuver) {
  const arrowMap = {
    straight: "↑",
    "slight-right": "↗",
    "turn-right": "→",
    "sharp-right": "↘",
    "slight-left": "↖",
    "turn-left": "←",
    "sharp-left": "↙",
    destination: "📍",
    start: "🚗",
  };
  return arrowMap[maneuver] || "•";
}

function getDirectionIcon(maneuver, isFirst, isLast) {
  if (isFirst) {
    const I = DirectionIcon.start;
    return <I />;
  }
  if (isLast) {
    const I = DirectionIcon.destination;
    return <I />;
  }
  const I = DirectionIcon[maneuver];
  if (I) return <I />;
  return (
    <span style={{ fontSize: "18px", fontWeight: 500 }}>
      {getFallbackArrow(maneuver)}
    </span>
  );
}

function getTrafficInfo() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (day === 0)
    return {
      level: "Very Low",
      icon: "⚪",
      multiplier: 1.0,
      message: "Sunday — very light activity",
    };
  if (day === 6)
    return {
      level: "Low",
      icon: "🟢",
      multiplier: 1.1,
      message: "Saturday — light traffic",
    };

  const peakHours = [8, 9, 12, 13, 16, 17];
  if (peakHours.includes(hour))
    return {
      level: "Heavy",
      icon: "🔴",
      multiplier: 1.5,
      message: "Peak hours — busy paths",
    };
  if (hour >= 6 && hour < 18)
    return {
      level: "Moderate",
      icon: "🟡",
      multiplier: 1.3,
      message: "Moderate traffic",
    };
  return { level: "Low", icon: "⚫", multiplier: 1.0, message: "Low traffic" };
}

const PROFILE_CONFIG = {
  standard: { label: "Standard", color: "#2563eb", icon: IconMap },
  accessible: {
    label: "Accessible",
    color: "#8b5cf6",
    icon: IconAccessibility,
  },
  night: { label: "Night Safety", color: "#f59e0b", icon: IconMoon },
  fastest: { label: "Fastest", color: "#22c55e", icon: IconBolt },
};

const PROFILES = [
  { key: "standard", icon: IconMap, label: "Standard", color: "#2563eb" },
  {
    key: "accessible",
    icon: IconAccessibility,
    label: "Accessible",
    color: "#8b5cf6",
  },
  { key: "night", icon: IconMoon, label: "Night", color: "#f59e0b" },
  { key: "fastest", icon: IconBolt, label: "Fastest", color: "#22c55e" },
];

const MODE_CONFIG = {
  walk: { icon: IconWalk, label: "Walk", color: "#14b8a6" },
  bicycle: { icon: IconBicycle, label: "Cycle", color: "#ec4899" },
  jogging: { icon: IconJog, label: "Jog", color: "#f97316" },
  car: { icon: IconCar, label: "Drive", color: "#ef4444" },
};

const MODES = [
  { key: "walk", icon: IconWalk, label: "Walk", color: "#14b8a6" },
  { key: "bicycle", icon: IconBicycle, label: "Cycle", color: "#ec4899" },
  { key: "jogging", icon: IconJog, label: "Jog", color: "#f97316" },
  { key: "car", icon: IconCar, label: "Drive", color: "#ef4444" },
];

const Legend = forwardRef(function Legend(
  {
    visible,
    route,
    routeActive = false,
    activeProfile = "standard",
    vehicleMode = "walk",
    warnings = [],
    alternatives = [],
    onSelectAlternative,
    activeAlternativeIndex = 0,
    currentLocation,
    onExpandedChange,
    onProfileChange,
    onVehicleModeChange,
    autoCollapse = false,
    disableDrag = false,
    onNavPanelClose,
    onDragProgress,
    showHeatmap = false,
    selectedHour,
    onSelectedHourChange,
    heatmapBounds,
  },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [directions, setDirections] = useState([]);
  const [heatmapPointCount, setHeatmapPointCount] = useState(0);
  const [heatmapLastRefresh, setHeatmapLastRefresh] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [completedDistance, setCompletedDistance] = useState(0);
  const [wasExpandedBeforeCollapse, setWasExpandedBeforeCollapse] =
    useState(true);
  const [activeTab, setActiveTab] = useState("stats");

  const hasRoute = Boolean(route && route.totalDistance);

  // ── Drag state refs (never cause re-renders) ─────────────────────────────
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const dragCurrentY = useRef(0);
  const dragStartExpanded = useRef(true);
  const dragVelocity = useRef(0);
  const lastDragTime = useRef(0);
  const lastDragY = useRef(0);
  const expandedTranslateY = useRef(0);
  const peekTranslateY = useRef(0);
  const lastThresholdStateRef = useRef(null);
  const userManuallyPeeked = useRef(false);

  const sheetRef = useRef(null);
  const headerRef = useRef(null);
  const directionsRef = useRef(null);
  const modeStripRef = useRef(null);

  const [indicatorLeft, setIndicatorLeft] = useState(4);
  const [indicatorWidth, setIndicatorWidth] = useState(56);

  const peekHeight = window.innerWidth >= 1024 ? 140 : 120;

  const updateIndicator = useCallback(() => {
    const strip = modeStripRef.current;
    if (!strip) return;
    const buttons = strip.querySelectorAll('.legend-mode-btn');
    const idx = MODES.findIndex(m => m.key === vehicleMode);
    if (idx < 0 || idx >= buttons.length) return;
    const btn = buttons[idx];
    const stripRect = strip.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicatorLeft(btnRect.left - stripRect.left);
    setIndicatorWidth(btnRect.width);
  }, [vehicleMode]);

  useLayoutEffect(() => {
    let raf1, raf2;
    const measure = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          updateIndicator();
        });
      });
    };
    measure();
    return () => { if (raf1) cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, [updateIndicator]);

  useEffect(() => {
    const strip = modeStripRef.current;
    if (!strip) return;
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [updateIndicator]);

  const lastAnnouncedRouteIdRef = useRef(null);
  const pendingRouteSummaryRef = useRef(null);
  const lastRouteSigRef = useRef(null); // Senior Fix: Track if destination actually changed
  const lastAnnouncedStepRef = useRef(-1); // Track last spoken turn index
  const pendingDragDownRef = useRef(null); // Track pending drag-down gesture from sheet body

  const { isVoiceEnabled, toggleVoice, speak, speakTurn, speakArrival } = useVoiceGuidance();
  const { trigger } = useHaptics();
  const focus = useFocus();

  // ── Helpers ──────────────────────────────────────────────────────────────

  const setTranslate = (y) => {
    const el = sheetRef.current;
    if (!el) return;

    const minY = expandedTranslateY.current;
    const maxY = peekTranslateY.current;
    const range = maxY - minY;
    
    // Normalized progress: 0 (peek) to 1 (expanded)
    const progress = range > 0 ? Math.max(0, Math.min(1, (maxY - y) / range)) : 0;

    // Senior Design Fix: Use constant blur to keep UI elements sharp and map readable.
    const blurValue = 20; 
    const opacityValue = 0.82 + (progress * 0.08);

    el.style.setProperty('--sheet-blur', `${blurValue}px`);
    el.style.setProperty('--sheet-opacity', opacityValue);

    const isDesktop = window.innerWidth >= 1024;
    el.style.transform = isDesktop 
      ? `translateX(-50%) translateY(${y}px)` 
      : `translateY(${y}px)`;

    // Pass normalized progress to external listeners (e.g., map blur)
    if (onDragProgress) onDragProgress(progress);
  };

  const snapTo = (targetY) => {
    const el = sheetRef.current;
    if (!el) return;

    // Ensure visual variables are set to their target values before snapping
    setTranslate(targetY);

    el.classList.add("legend-sheet--snapping");
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      el.style.transform = `translateX(-50%) translateY(${targetY}px)`;
    } else {
      el.style.transform = `translateY(${targetY}px)`;
    }
    const onEnd = () => {
      el.classList.remove("legend-sheet--snapping");
      el.removeEventListener("transitionend", onEnd);
    };
    el.addEventListener("transitionend", onEnd);
  };

  const recalcPositions = () => {
    if (!sheetRef.current) return;
    
    // By moving the visual fill to a pseudo-element (::after),
    // offsetHeight now correctly measures only the visible content.
    // This makes the drag-up math (h - peekHeight) robust and snappy.
    const h = sheetRef.current.offsetHeight;
    
    peekTranslateY.current = h - peekHeight;
    expandedTranslateY.current = 0;
  };

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS && !isStandalone) {
      el.classList.add("legend-sheet--browser-ios");
    }

    // Capture-phase touchstart: block touches from reaching Leaflet
    // BEFORE Leaflet's own passive touchstart listener can grab them.
    const captureTouchStart = (e) => {
      e.stopPropagation();
      document.body.classList.add("dragging-legend");
    };
    el.addEventListener("touchstart", captureTouchStart, { capture: true, passive: false });

    let initialSnapped = false;
    const ro = new ResizeObserver(() => {
      recalcPositions();
      if (!initialSnapped) {
        initialSnapped = true;
        snapTo(peekTranslateY.current);
      }
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("touchstart", captureTouchStart, { capture: true });
      ro.disconnect();
    };
  }, []);

  // ── Recalc when sheet becomes visible or route data changes ────────────
  useEffect(() => {
    if (!visible) return;
    const el = sheetRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      recalcPositions();
      snapTo(peekTranslateY.current);
      ro.disconnect();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [visible, hasRoute]);

  // ── Recalc peek position whenever expanded changes ───────────────────────
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      recalcPositions();
      snapTo(expanded ? expandedTranslateY.current : peekTranslateY.current);
      ro.disconnect();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [expanded]);

  // ── Voice ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (route?.totalDistance) {
      pendingRouteSummaryRef.current = {
        distance: formatDistance(route.totalDistance),
        time: formatTravelTime(route.totalDistance, vehicleMode),
      };
    } else {
      pendingRouteSummaryRef.current = null;
    }
  }, [route, vehicleMode]);

  const handleVoiceToggle = () => {
    trigger(10);
    const wasEnabled = isVoiceEnabled;
    toggleVoice();
    if (!wasEnabled && pendingRouteSummaryRef.current) {
      const { distance, time } = pendingRouteSummaryRef.current;
      setTimeout(
        () => speak(`Route calculated. ${distance}, about ${time}.`),
        100,
      );
    }
  };

  // ── Auto-collapse when NavPanel opens ────────────────────────────────────
  useEffect(() => {
    if (autoCollapse && expanded) {
      setWasExpandedBeforeCollapse(true);
      setExpanded(false);
    } else if (!autoCollapse && wasExpandedBeforeCollapse && !expanded) {
      if (!userManuallyPeeked.current) {
        setExpanded(true);
      }
      setWasExpandedBeforeCollapse(false);
      userManuallyPeeked.current = false;
    }
  }, [autoCollapse]);

  // ── Directions ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (route?.coordinates?.length > 0) {
      const dirs = generateDirections(route.coordinates, route.roadNames || []);
      setDirections(dirs);
      setCurrentStepIndex(-1);
      lastAnnouncedStepRef.current = -1;
    } else {
      setDirections([]);
      setCurrentStepIndex(-1);
      lastAnnouncedStepRef.current = -1;
    }
  }, [route]);

  // ── Recalc when route changes (new search result) ────────────────────────
  useEffect(() => {
    if (!route?.coordinates?.length) {
      lastRouteSigRef.current = null;
      return;
    }

    const start = route.coordinates[0];
    const end = route.coordinates[route.coordinates.length - 1];
    const signature = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}-${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;

    const el = sheetRef.current;
    if (!el) return;

    // Only collapse if the route signature (start/end) has actually changed.
    // This prevents the sheet from "dragging down" during a simple profile switch.
    const isNewRoute = lastRouteSigRef.current !== signature;
    if (isNewRoute) setExpanded(false);
    lastRouteSigRef.current = signature;

    const ro = new ResizeObserver(() => {
      recalcPositions();
      snapTo(isNewRoute ? peekTranslateY.current : (expanded ? expandedTranslateY.current : peekTranslateY.current));
      ro.disconnect();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [route]);

  // ── Auto-expand when route becomes available while Legend is visible ──────
  const prevHasRouteRef = useRef(hasRoute);
  useEffect(() => {
    if (hasRoute && !prevHasRouteRef.current && visible) {
      setExpanded(true);
    }
    prevHasRouteRef.current = hasRoute;
  }, [hasRoute, visible]);

  const TIME_SLOTS = [
    { label: "All day", hour: undefined },
    { label: "Morning", hour: 8 },
    { label: "Midday", hour: 12 },
    { label: "Afternoon", hour: 16 },
    { label: "Evening", hour: 19 },
    { label: "Night", hour: 22 },
  ];

  function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  useEffect(() => {
    if (!showHeatmap || !heatmapBounds) return;
    let cancelled = false;
    (async () => {
      try {
        const points = await fetchHeatmapData(heatmapBounds, { hour: selectedHour });
        if (!cancelled) {
          setHeatmapPointCount(points.length);
          setHeatmapLastRefresh(new Date());
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [showHeatmap, heatmapBounds, selectedHour]);

  useEffect(() => {
    if (currentStepIndex >= 0 && directionsRef.current) {
      const el = directionsRef.current.querySelector(
        `[data-step-index="${currentStepIndex}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentStepIndex]);

  useEffect(() => {
    if (
      !currentLocation ||
      !route?.coordinates?.length ||
      directions.length === 0
    )
      return;
    let minDist = Infinity,
      closestIndex = 0;
    for (let i = 0; i < route.coordinates.length; i++) {
      const p = route.coordinates[i];
      const d =
        Math.sqrt(
          (p.lat - currentLocation.lat) ** 2 +
            (p.lng - currentLocation.lng) ** 2,
        ) * 111319;
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    }
    let distFromStart = 0;
    for (let i = 1; i <= closestIndex; i++) {
      const a = route.coordinates[i - 1],
        b = route.coordinates[i];
      distFromStart +=
        Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2) * 111319;
    }
    setCompletedDistance(distFromStart);
    for (let i = 0; i < directions.length; i++) {
      if (
        directions[i].distance > distFromStart ||
        directions[i].isDestination
      ) {
        setCurrentStepIndex(i);
        break;
      }
    }
  }, [currentLocation, route, directions]);

  // ── Turn-by-turn voice announcements ─────────────────────────────────────
  useEffect(() => {
    if (!isVoiceEnabled || currentStepIndex < 0 || directions.length === 0) return;
    if (currentStepIndex === lastAnnouncedStepRef.current) return;

    const step = directions[currentStepIndex];
    if (!step) return;

    lastAnnouncedStepRef.current = currentStepIndex;

    if (step.isDestination) {
      speakArrival();
    } else {
      // Calculate remaining distance to this turn from current position
      const distToTurn = Math.max(0, step.distance - completedDistance);
      speakTurn(step.instruction, distToTurn);
    }
  }, [currentStepIndex, isVoiceEnabled, directions, completedDistance, speakTurn, speakArrival]);

  // ── Imperative handle ────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    collapse: () => {
      if (expanded) setExpanded(false);
    },
    expand: () => {
      if (!expanded) setExpanded(true);
    },
    isExpanded: () => expanded,
  }));

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!isVoiceEnabled || !route?.totalDistance) return;
    const routeId = `${route.totalDistance}-${route.coordinates?.length ?? 0}`;
    if (lastAnnouncedRouteIdRef.current === routeId) return;
    lastAnnouncedRouteIdRef.current = routeId;
    speak(
      `Route calculated. ${formatDistance(route.totalDistance)}, about ${formatTravelTime(route.totalDistance, vehicleMode)}.`,
    );
  }, [route, isVoiceEnabled, vehicleMode, speak]);

  // ── Report drag progress for map blur ────────────────────────────────────
  const reportDragProgress = (currentY) => {
    // Logic moved into setTranslate for higher performance and atomicity
  };

  // ── DRAG HANDLERS ────────────────────────────────────────────────────────

  const handleDragStart = (e) => {
    if (disableDrag) return;

    const target = e.target;

    // Don't drag if the user tapped an interactive element
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;

    // For standard compliance, we only preventDefault on touch to seize control from the browser
    if (e.type === 'touchstart' && e.cancelable) e.preventDefault();
    e.stopPropagation();

    const el = sheetRef.current;
    if (!el) return;

    // 1. INSTANT INTERRUPT: Hard-kill any transitions so the sheet is "glued" to the finger
    el.classList.remove("legend-sheet--snapping");
    el.style.setProperty('transition', 'none', 'important'); 

    // 2. PRECISION CATCH: Get the EXACT current translateY via DOMMatrix
    const style = window.getComputedStyle(el);
    const matrix = new DOMMatrix(style.transform);
    const currentY = matrix.m42;
    
    // Store the exact starting point
    dragStartScrollTop.current = currentY;

    const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    lastDragY.current = clientY;
    lastDragTime.current = performance.now();
    dragStartExpanded.current = expanded;
    dragVelocity.current = 0;

    // 3. THRESHOLD INIT: Set up haptic monitoring
    const mid = (expandedTranslateY.current + peekTranslateY.current) / 2;
    lastThresholdStateRef.current = currentY < mid;

    setIsDragging(true);
    el.classList.add("dragging");
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;

    // Block native scroll instantly
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    const now = performance.now();
    const dt = now - lastDragTime.current;

    // Damped velocity calculation to prevent "shooting" from single-frame spikes
    if (dt > 0) {
      const instantVelocity = (clientY - lastDragY.current) / dt;
      dragVelocity.current = 0.8 * dragVelocity.current + 0.2 * instantVelocity;
    }
    
    lastDragY.current = clientY;
    lastDragTime.current = now;

    // 1:1 Displacement Math
    const deltaY = clientY - dragStartY.current;
    const rawY = dragStartScrollTop.current + deltaY;

    const minY = expandedTranslateY.current;
    const maxY = peekTranslateY.current;

    // Resistance at boundaries (Rubber-banding)
    let targetY = rawY;
    if (rawY < minY) {
      targetY = minY - Math.pow(minY - rawY, 0.85);
    } else if (rawY > maxY) {
      targetY = maxY + Math.pow(rawY - maxY, 0.85);
    }

    // Haptic monitoring
    const midThreshold = (minY + maxY) / 2;
    const predictedExpand = (Math.abs(dragVelocity.current) > 0.5) 
      ? dragVelocity.current < 0 
      : targetY < midThreshold;

    if (lastThresholdStateRef.current !== predictedExpand) {
      if (navigator.vibrate) navigator.vibrate(8);
      lastThresholdStateRef.current = predictedExpand;
    }

    setTranslate(targetY);
  };

  const handleDragEnd = (e) => {
    if (!isDragging) return;
    e?.stopPropagation();
    e?.preventDefault();

    const el = sheetRef.current;
    if (el) el.classList.remove("dragging");
    setIsDragging(false);

    const currentY = parseFloat(
      el?.style.transform?.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? "0",
    );

    const minY = expandedTranslateY.current;
    const maxY = peekTranslateY.current;
    const mid = (minY + maxY) / 2;
    
    let shouldExpand;
    if (Math.abs(dragVelocity.current) > 0.4) {
      shouldExpand = dragVelocity.current < 0;
    } else {
      shouldExpand = currentY < mid;
    }

    // Final snap initiation haptic
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(shouldExpand !== expanded ? 15 : 10);
    }

    snapTo(shouldExpand ? minY : maxY);

    if (onDragProgress) {
      onDragProgress(shouldExpand ? 1 : 0);
    }

    if (shouldExpand !== expanded) {
      if (!shouldExpand) {
        userManuallyPeeked.current = true;
      }
      setExpanded(shouldExpand);
      if (shouldExpand && onNavPanelClose) onNavPanelClose();
    }
  };

  // ── Sheet-level pending drag-down (drag DOWN anywhere to collapse) ──────
  const seizeDragFromPending = useCallback((startClientY) => {
    const el = sheetRef.current;
    if (!el) return;

    el.classList.remove("legend-sheet--snapping");
    el.style.setProperty('transition', 'none', 'important');

    const style = window.getComputedStyle(el);
    const matrix = new DOMMatrix(style.transform);
    const currentY = matrix.m42;

    dragStartScrollTop.current = currentY;
    dragStartY.current = startClientY;
    lastDragY.current = startClientY;
    lastDragTime.current = performance.now();
    dragStartExpanded.current = expanded;
    dragVelocity.current = 0;

    const mid = (expandedTranslateY.current + peekTranslateY.current) / 2;
    lastThresholdStateRef.current = currentY < mid;

    setIsDragging(true);
    el.classList.add("dragging");
  }, [expanded]);

  const handleSheetMouseDown = (e) => {
    // Let header handle its own drag
    if (e.target.closest('.legend-drag-header')) return;
    handleDragStart(e);
  };

  const handleSheetTouchStart = (e) => {
    // Always stop propagation to prevent Leaflet from grabbing the touch
    e.stopPropagation();

    if (disableDrag) return;
    // Let header handle its own drag
    if (e.target.closest('.legend-drag-header')) return;
    // Don't interfere with interactive elements
    if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;

    const clientY = e.touches[0].clientY;
    const body = e.target.closest('.legend-body');

    pendingDragDownRef.current = {
      startY: clientY,
      inBody: !!body,
      atTop: body ? body.scrollTop <= 0 : true,
    };
  };

  const handleSheetTouchMoveCapture = (e) => {
    const pending = pendingDragDownRef.current;
    if (!pending) return;

    const clientY = e.touches[0].clientY;
    const deltaY = clientY - pending.startY;

    // Cancel if moved upward at all
    if (deltaY < -5) {
      pendingDragDownRef.current = null;
      return;
    }

    // Cancel if in body and body is scrolled — let native scroll handle it
    if (pending.inBody && !pending.atTop) {
      pendingDragDownRef.current = null;
      return;
    }

    // Commit after 10px downward movement
    if (deltaY > 10) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      pendingDragDownRef.current = null;
      seizeDragFromPending(pending.startY);
    }
  };

  const handleSheetTouchEnd = () => {
    pendingDragDownRef.current = null;
    // Clean up the class added by capture-phase touchstart
    // (only if isDragging didn't take over — that useEffect handles its own cleanup)
    if (!isDragging) {
      document.body.classList.remove("dragging-legend");
    }
  };

  // ── Global move/up listeners while dragging ──────────────────────────────
  useEffect(() => {
    if (!isDragging) {
      document.body.classList.remove("dragging-legend");
      return;
    }
    document.body.classList.add("dragging-legend");

    const onMove = (e) => handleDragMove(e);
    const onUp = (e) => handleDragEnd(e);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);

    return () => {
      document.body.classList.remove("dragging-legend");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [isDragging]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!visible) return null;

  const distMeters = hasRoute ? route.totalDistance : null;
  const isFallback = route?.isFallback || false;
  const hasWarnings = warnings.length > 0;
  const hasAlts = alternatives.length > 0;
  const estimatedTime = hasRoute
    ? formatTravelTime(distMeters, vehicleMode)
    : null;
  const carTime = hasRoute ? formatTravelTime(distMeters, "car") : null;
  const walkTime = hasRoute ? formatTravelTime(distMeters, "walk") : null;
  const cycleTime = hasRoute ? formatTravelTime(distMeters, "bicycle") : null;
  const jogTime = hasRoute ? formatTravelTime(distMeters, "jogging") : null;
  const traffic = getTrafficInfo();
  const modeTimes = { walk: walkTime, bicycle: cycleTime, jogging: jogTime, car: carTime };

  const AVG_STRIDE_M = 0.762;
  const MET_VALUES = { walk: 3.8, jogging: 7.0, bicycle: 6.8, car: 1.8 };
  const metValue = MET_VALUES[vehicleMode] || 3.8;
  const steps = hasRoute ? Math.round(completedDistance / AVG_STRIDE_M) : 0;
  const caloriesBurned = hasRoute ? Math.round(metValue * 68 * (completedDistance / 1000) / 60 * 60) : 0;
  const totalSteps = hasRoute ? Math.round(distMeters / AVG_STRIDE_M) : 0;
  const totalCalories = hasRoute ? Math.round(metValue * 68 * (distMeters / 1000) / 60 * 60) : 0;

  const getBarWidth = () => {
    if (traffic.level === "Heavy") return "100%";
    if (traffic.level === "Moderate") return "70%";
    if (traffic.level === "Low") return "40%";
    if (traffic.level === "Very Low") return "20%";
    return "50%";
  };

  const vehicleConfig = MODE_CONFIG[vehicleMode] || MODE_CONFIG.walk;
  const VehicleIcon = vehicleConfig.icon;

  const compareMode = vehicleMode === "walk" ? "bicycle" : "walk";
  const CompareIcon = compareMode === "bicycle" ? IconBicycle : IconWalk;
  const compareTime = compareMode === "bicycle" ? cycleTime : walkTime;
  const compareLabel = compareMode === "bicycle" ? "Cycle" : "Walk";

  return (
    <>
    <div
      ref={sheetRef}
      className={`legend-sheet ${expanded ? "legend-sheet--expanded" : "legend-sheet--peek"} legend-sheet--with-bar`}
      onMouseDown={handleSheetMouseDown}
      onTouchStart={handleSheetTouchStart}
      onTouchMoveCapture={handleSheetTouchMoveCapture}
      onTouchEnd={handleSheetTouchEnd}
    >
      {/* ── Unified top area: handle, mode strip, peek hint ── */}
      <div
        ref={headerRef}
        className="legend-drag-header"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="legend-handle-wrap">
          <div className="legend-handle" />
        </div>

        {/* Peek hint (above mode strip) */}
        {!hasRoute ? (
          <div className="legend-peek-hint">
            <div className="three-dot-loader">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <span>{routeActive ? "Restoring your route..." : "Search for a destination to get directions"}</span>
          </div>
        ) : (
          <div className="legend-peek-hint legend-peek-hint--insights">
            <span>More Insights</span>
            <span className="insights-mode-name" style={{ color: vehicleConfig.color }}>{vehicleConfig.label}</span>
          </div>
        )}

        {/* Mode strip (icons only) with sliding indicator */}
        {hasRoute && (
        <div
          ref={modeStripRef}
          className="legend-mode-strip"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {MODES.map((m) => {
            const MIcon = m.icon;
            const isActive = vehicleMode === m.key;
            return (
                <button
                  key={m.key}
                  className={`legend-mode-btn ${isActive ? "legend-mode-btn--active" : ""}`}
                  style={{ '--mode-color': m.color }}
                  onClick={() => { trigger(10); onVehicleModeChange?.(m.key); }}
                  title={m.label}
                  aria-label={`Switch to ${m.label}`}
                >
                <MIcon
                  className="w-6 h-6"
                  color={isActive ? m.color : "#9ca3af"}
                />
                {modeTimes[m.key] && (
                  <span className="mode-btn-time">{modeTimes[m.key]}</span>
                )}
              </button>
            );
          })}
          <div className="mode-track">
            <div
              className="mode-indicator"
              style={{ left: `${indicatorLeft}px`, width: `${indicatorWidth}px`, '--mode-color': vehicleConfig.color }}
            />
          </div>
        </div>
        )}
      </div>



      {/* ── Expanded body with tabs ──────────────────────────────────────── */}
      {expanded && (
        <div
          className="legend-body"
          onWheel={(e) => e.stopPropagation()}
        >
          {!hasRoute ? (
            <div className="legend-empty-route">
              <div className="empty-route-icon">
                <div className="three-dot-loader three-dot-loader--lg">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
              {routeActive ? (
                <>
                  <h3 className="empty-route-title">Restoring your route</h3>
                  <p className="empty-route-text">
                    Loading the road network and recalculating your route...
                  </p>
                </>
              ) : (
                <>
                  <h3 className="empty-route-title">Be in the know</h3>
                  <p className="empty-route-text">
                    Tap the search bar to find places on campus and get step-by-step directions.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Tab bar — 2 tabs */}
              <div className="legend-tab-bar">
                <button
                  className={`legend-tab ${activeTab === "stats" ? "legend-tab--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); trigger(10); setActiveTab("stats"); }}
                >
                  <IconChartBar className="w-4 h-4" />
                  <span>Stats</span>
                </button>
                <button
                  className={`legend-tab ${activeTab === "directions" ? "legend-tab--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); trigger(10); setActiveTab("directions"); }}
                >
                  <IconDirections className="w-4 h-4" />
                  <span>Directions</span>
                </button>
              </div>

              {/* Tab: Stats — dynamic comparisons, no mode self-reference */}
              {activeTab === "stats" && (
                <div className="legend-tab-content">
                  <div className="legend-stats-grid">
                    <div className="legend-stat-card">
                      <span className="stat-card-icon">
                        <VehicleIcon className="w-5 h-5" color={vehicleConfig.color} />
                      </span>
                      <div className="stat-card-info">
                        <span className="stat-card-value">{estimatedTime}</span>
                        <span className="stat-card-label">{vehicleConfig.label}</span>
                      </div>
                    </div>
                    <div className="legend-stat-divider" />
                    <div className="legend-stat-card">
                      <span className="stat-card-icon">
                        <CompareIcon className="w-5 h-5" color={compareMode === "bicycle" ? "#3b82f6" : "#22c55e"} />
                      </span>
                      <div className="stat-card-info">
                        <span className="stat-card-value">{compareTime}</span>
                        <span className="stat-card-label">{compareLabel}</span>
                      </div>
                    </div>
                    <div className="legend-stat-divider" />
                    <div className="legend-stat-card">
                      <span className="stat-card-icon">
                        <IconRuler className="w-5 h-5" color="#3b82f6" />
                      </span>
                      <div className="stat-card-info">
                        <span className="stat-card-value">{formatDistance(distMeters)}</span>
                        <span className="stat-card-label">Distance</span>
                      </div>
                    </div>
                  </div>

                  <div className="legend-stats-row">
                    <div className="legend-stat-mini">
                      <IconFlame className="w-4 h-4" color="#ef4444" />
                      <span className="stat-mini-label">Calories</span>
                      <span className="stat-mini-value">{completedDistance > 0 ? `${caloriesBurned}` : totalCalories > 0 ? `0` : `—`}</span>
                      {totalCalories > 0 && <span className="stat-mini-sub">/{totalCalories}</span>}
                    </div>
                    <div className="legend-stat-mini">
                      <IconMountain className="w-4 h-4" color="#8b5cf6" />
                      <span className="stat-mini-label">Elevation</span>
                      <span className="stat-mini-value">—</span>
                    </div>
                    <div className="legend-stat-mini">
                      <IconSteps className="w-4 h-4" color="#f59e0b" />
                      <span className="stat-mini-label">Steps</span>
                      <span className="stat-mini-value">{completedDistance > 0 ? `${steps.toLocaleString()}` : totalSteps > 0 ? `0` : `—`}</span>
                      {totalSteps > 0 && <span className="stat-mini-sub">/{totalSteps.toLocaleString()}</span>}
                    </div>
                    <div className="legend-stat-mini">
                      <IconRoad className="w-4 h-4" color="#6b7280" />
                      <span className="stat-mini-label">Surface</span>
                      <span className="stat-mini-value">Mixed</span>
                    </div>
                  </div>

                  <div className="legend-traffic">
                    <div className="legend-traffic-info">
                      <span className="legend-traffic-label">Traffic</span>
                      <span className="legend-traffic-value">{traffic.level}</span>
                    </div>
                    <div className="legend-traffic-bar">
                      <div
                        className={`legend-traffic-bar-fill ${traffic.level.toLowerCase().replace(" ", "-")}`}
                        style={{ width: getBarWidth() }}
                      />
                    </div>
                  </div>

                  <WeatherBanner />
                </div>
              )}

              {/* Tab: Directions — voice + share + directions + alternatives */}
              {activeTab === "directions" && (
                <div className="legend-tab-content">
                  <div className="legend-voice-row">
                    <button
                      className={`legend-voice-btn ${isVoiceEnabled ? "legend-voice-btn--active" : ""}`}
                      onClick={handleVoiceToggle}
                      title={isVoiceEnabled ? "Disable voice guidance" : "Enable voice guidance"}
                      aria-pressed={isVoiceEnabled}
                    >
                      <IconSpeakerWave className="w-4 h-4" color={isVoiceEnabled ? "#3b82f6" : "#9ca3af"} />
                      <span>{isVoiceEnabled ? "Voice guidance ON" : "Voice guidance OFF"}</span>
                    </button>
                  </div>

                  {directions.length > 0 ? (
                    <div className="legend-directions-section">
                      <div className="legend-directions-header">
                        <span className="directions-title">Directions</span>
                        <span className="directions-steps-count">
                          {directions.length - 1} turns
                        </span>
                      </div>
                      <div className="legend-directions-list" ref={directionsRef}>
                        {directions.map((step, idx) => (
                          <div
                            key={idx}
                            data-step-index={idx}
                            className={`legend-direction-step
                              ${currentStepIndex === idx ? "legend-direction-step--active" : ""}
                              ${step.isDestination ? "legend-direction-step--destination" : ""}`}
                          >
                            <div className="direction-icon">
                              {getDirectionIcon(step.maneuver, idx === 0, step.isDestination)}
                            </div>
                            <div className="direction-content">
                              <div className="direction-instruction">{step.instruction}</div>
                              {!step.isDestination && step.distance > 0 && (
                                <div className="direction-distance">{formatDistance(step.distance)}</div>
                              )}
                            </div>
                            {currentStepIndex === idx && (
                              <div className="direction-active-indicator" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="legend-empty-state">No directions available</div>
                  )}

                  {hasAlts && (
                    <>
                      <div className="legend-divider" />
                      <p className="legend-alts-label">Alternative routes</p>
                      <div className="legend-alts">
                        <div
                          className={`legend-alt ${activeAlternativeIndex === 0 ? "legend-alt--active" : ""} ${focus.isFocused("legendItem", "alt-0") ? "item--focused" : ""}`}
                          onClick={() => { trigger(10); focus.setFocus("legendItem", "alt-0", "legend"); onSelectAlternative?.(0); }}
                        >
                          <span className="alt-line alt-line--primary" />
                          <div className="alt-info">
                            <span className="alt-name">Recommended</span>
                            <span className="alt-time">{estimatedTime}</span>
                          </div>
                          <span className="alt-dist">{formatDistance(distMeters)}</span>
                        </div>
                        {alternatives.map((alt, i) => (
                          <div
                            key={i}
                            className={`legend-alt ${activeAlternativeIndex === i + 1 ? "legend-alt--active" : ""} ${focus.isFocused("legendItem", `alt-${i + 1}`) ? "item--focused" : ""}`}
                            onClick={() => { trigger(10); focus.setFocus("legendItem", `alt-${i + 1}`, "legend"); onSelectAlternative?.(i + 1); }}
                          >
                            <span className="alt-line alt-line--secondary" />
                            <div className="alt-info">
                              <span className="alt-name">Alternative {i + 1}</span>
                              <span className="alt-time">{formatTravelTime(alt.totalDistance, vehicleMode)}</span>
                            </div>
                            <span className="alt-dist">{formatDistance(alt.totalDistance)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <button className="legend-share-btn" onClick={() => { trigger(10); handleShareLocation(); }}>
                    <span className="share-icon">
                      <IconShare className="w-4 h-4" color="#3b82f6" />
                    </span>
                    <span>Share my location</span>
                  </button>

                  {isFallback && (
                    <div className="legend-fallback-note">
                      ⚡ Direct connection used — small gap in road data
                    </div>
                  )}
                </div>
              )}

              {/* ── Warnings (always visible regardless of tab) ── */}
              {hasWarnings && (
                <>
                  <div className="legend-divider" />
                  <div className="legend-warnings">
                    {warnings.map((w, i) => {
                      const WarningIcon = w.type === "danger" ? IconWarning : IconInfo;
                      const warningColor = w.type === "danger" ? "#ef4444" : "#3b82f6";
                      return (
                        <div key={i} className={`legend-warning legend-warning--${w.type || "info"}`}>
                          <span className="warning-icon">
                            <WarningIcon className="w-4 h-4" color={warningColor} />
                          </span>
                          <span className="warning-text">{w.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

            </>
          )}
        </div>
      )}

      {/* ── Heatmap ── */}
      {showHeatmap && (
        <div className="legend-heatmap">
          <div className="legend-heatmap-pills">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.label}
                  className={`legend-heatmap-pill ${selectedHour === slot.hour ? "legend-heatmap-pill--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); trigger(8); onSelectedHourChange?.(slot.hour); }}
                >
                  {slot.label}
                </button>
              ))}
            </div>
            <div className="legend-heatmap-stats">
              {!heatmapBounds ? (
                <span className="heatmap-empty">Move map to see data</span>
              ) : heatmapPointCount > 0 ? (
                <span>{heatmapPointCount.toLocaleString()} data point{heatmapPointCount !== 1 ? 's' : ''}</span>
              ) : (
                <span className="heatmap-empty">
                  {hasRoute
                    ? 'Your route will help others navigate'
                    : 'Be the first to navigate here'
                  }
                </span>
              )}
              {heatmapLastRefresh && (
                <span className="heatmap-refresh-time">
                  Updated {timeAgo(heatmapLastRefresh)}
                </span>
              )}
            </div>
            <div className="legend-heatmap-legend">
              <span className="heatmap-legend-label">Low</span>
              <div className="heatmap-legend-bar" />
              <span className="heatmap-legend-label">High</span>
            </div>
          </div>
      )}
    </div>

      {/* ── Fixed profile bar (always visible at bottom of viewport) ── */}
      <div className="legend-profiles-bar">
          {PROFILES.map((p) => {
            const IconComponent = p.icon;
            const isActive = activeProfile === p.key;
            return (
              <button
                key={p.key}
                data-profile={p.key}
                className={`legend-profile-btn ${isActive ? "legend-profile-btn--active" : ""}`}
                onClick={() => { trigger(10); onProfileChange?.(p.key); }}
                title={p.label}
                aria-label={`Switch to ${p.label} profile`}
              >
                <span className="legend-profile-icon">
                  <IconComponent
                    className="w-4 h-4"
                    color={isActive ? p.color : "currentColor"}
                  />
                </span>
                <span className="legend-profile-label">{p.label}</span>
              </button>
            );
          })}
        </div>
    </>
  );

  function handleShareLocation() {
    if (!currentLocation) {
      alert("Location not available yet. Please wait for GPS fix.");
      return;
    }
    const baseUrl = import.meta.env.PROD
      ? "https://ugnavigator.onrender.com"
      : window.location.origin;
    const link = `${baseUrl}?lat=${currentLocation.lat}&lng=${currentLocation.lng}&name=Shared%20Location`;
    navigator.clipboard.writeText(link);
    alert("Location link copied! Share it with your friends.");
  }
});

export default Legend;
