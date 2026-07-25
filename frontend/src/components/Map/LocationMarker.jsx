// components/Map/LocationMarker.jsx
import { Marker, Circle } from "react-leaflet";
import { currentLocationIcon, customLocationIcon } from "../../function/utils/icons";
import L from "leaflet";

// Create pulsing icon with direction arrow (derived from route)
function createPulsingIcon(speed, heading, isLowAccuracy = false, routeDirection = null, deviceHeading = null) {
  // Priority: route direction > device heading (compass) > GPS heading
  const finalHeading = routeDirection != null && routeDirection !== 0
    ? routeDirection
    : (deviceHeading != null ? deviceHeading : (heading || 0));
  
  // Speed determines pulse intensity
  const pulseIntensity = Math.min(1, (speed || 0) / 3);
  
  const pulseClass = pulseIntensity > 0.1 ? `pulse-${Math.floor(pulseIntensity * 10)}` : '';
  
  // Orange for low accuracy, blue for good accuracy
  const arrowColor = isLowAccuracy ? "#f59e0b" : "#2563eb";
  const shadowColor = isLowAccuracy ? "rgba(245, 158, 11, 0.3)" : "rgba(37, 99, 235, 0.3)";
  const dotColor = isLowAccuracy ? "#f59e0b" : "#2563eb";
  
  const iconHtml = currentLocationIcon.options.html || '';
  
  // Direction arrow - rotates to match route direction
  const directionArrow = finalHeading && finalHeading !== 0 ? `
    <div style="
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(${finalHeading}deg);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 14px solid ${arrowColor};
      filter: drop-shadow(0 2px 4px ${shadowColor});
      animation: ${pulseIntensity > 0 ? 'arrowWiggle 0.5s ease-in-out infinite' : 'none'};
    "></div>
  ` : '';
  
  // Pulsing ring effect
  const pulseRing = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      width: 40px;
      height: 40px;
      margin-left: -20px;
      margin-top: -20px;
      border-radius: 50%;
      background: radial-gradient(circle, ${dotColor}30 0%, ${dotColor}00 70%);
      animation: pulseRing 1.5s ease-out infinite;
      pointer-events: none;
    "></div>
  `;
  
  const speedText = speed && speed > 0.1 ? `
    <div style="
      position: absolute;
      bottom: -22px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.75);
      color: white;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 20px;
      white-space: nowrap;
      font-family: monospace;
      backdrop-filter: blur(4px);
      letter-spacing: 0.5px;
    ">
      ${(speed * 3.6).toFixed(1)} km/h
    </div>
  ` : '';
  
  return L.divIcon({
    html: `
      <div class="gps-marker ${pulseClass}" style="position: relative;">
        ${pulseRing}
        ${iconHtml}
        ${directionArrow}
        ${speedText}
      </div>
    `,
    className: "nav-location-marker",
    iconSize: [18, 18], // 18px dot as requested
    iconAnchor: [9, 9],
    popupAnchor: [0, -36]
  });
}

export function GpsLocationMarker({ 
  location, 
  accuracy, 
  isLowAccuracy = false, 
  routeDirection = null,
  smoothedPosition = null,
  deviceHeading = null 
}) {
  const displayPosition = smoothedPosition || location;
  
  if (!displayPosition) return null;

  const hasHeading = location?.heading && location?.heading !== 0;
  const hasSpeed = location?.speed && location?.speed > 0;
  const hasDeviceHeading = deviceHeading != null;
  
  // Orange for low accuracy, blue for good accuracy
  const markerColor = isLowAccuracy ? "#f59e0b" : "#2563eb";
  
  // Create the 18px blue dot with white border as per design requirements
  const dotIcon = L.divIcon({
    html: `<div style="
      width: 18px; 
      height: 18px; 
      background: ${markerColor}; 
      border: 2.5px solid white; 
      border-radius: 50%; 
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    className: 'nav-dot-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  // Pass routeDirection and deviceHeading to the icon creator (for arrow alignment)
  const markerIcon = (hasHeading || hasSpeed || routeDirection !== null || hasDeviceHeading)
    ? createPulsingIcon(location?.speed, location?.heading, isLowAccuracy, routeDirection, deviceHeading)
    : dotIcon;

  // Calculate opacity based on accuracy
  const opacity = accuracy ? Math.max(0.5, Math.min(1, 30 / accuracy)) : 0.8;

  return (
    <>
      <Marker
        position={[displayPosition.lat, displayPosition.lng]}
        icon={markerIcon}
        draggable={false}
        zIndexOffset={1000}
      />
      {accuracy && (
        <Circle
          center={[displayPosition.lat, displayPosition.lng]}
          radius={accuracy}
          pathOptions={{
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.06 * opacity,
            weight: 1.5,
            opacity: 0.4,
            dashArray: isLowAccuracy ? "5, 5" : undefined,
          }}
        />
      )}
    </>
  );
}

// Custom green pin — draggable, used as custom start point
export function CustomLocationMarker({ location, onDragEnd, visible = true }) {
  if (!location || !visible) return null;

  return (
    <Marker
      position={[location.lat, location.lng]}
      icon={customLocationIcon}
      draggable={true}
      zIndexOffset={1000}
      eventHandlers={{ dragend: onDragEnd }}
    />
  );
}