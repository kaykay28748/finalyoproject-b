// services/directions.js
// Generates turn-by-turn instructions from route coordinates with road names

// Calculate bearing between two points (in degrees)
function calculateBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  return bearing;
}

// Calculate distance between two points in meters
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getManeuver(angleChange) {
  const absAngle = Math.abs(angleChange);
  
  if (absAngle < 15) return "straight";
  if (absAngle < 40) return angleChange > 0 ? "slight-right" : "slight-left";
  if (absAngle < 120) return angleChange > 0 ? "turn-right" : "turn-left";
  return angleChange > 0 ? "sharp-right" : "sharp-left";
}

// Generate natural language instruction with road name
function getInstruction(maneuver, distance, roadName, isFirst, isLast) {
  if (isFirst) {
    return "Head toward your destination";
  }
  
  if (isLast) {
    return "You have arrived at your destination";
  }
  
  const roadText = roadName ? ` onto ${roadName}` : '';
  
  // Make distance natural
  let distanceText = "";
  if (distance > 0 && distance < 400) {
    if (distance < 50) {
      distanceText = "then immediately ";
    } else if (distance < 150) {
      distanceText = "in a short distance, ";
    } else {
      distanceText = `in about ${Math.round(distance / 10) * 10} meters, `;
    }
  } else if (distance >= 400) {
    distanceText = `in ${(distance / 1000).toFixed(1)} kilometers, `;
  }
  
  const maneuverText = {
    "straight": "continue straight",
    "slight-right": "bear right",
    "turn-right": "turn right",
    "sharp-right": "make a sharp right turn",
    "slight-left": "bear left",
    "turn-left": "turn left",
    "sharp-left": "make a sharp left turn",
  }[maneuver] || "continue";
  
  return `${distanceText}${maneuverText}${roadText}`;
}

// Get turn icon
function getTurnIcon(maneuver, isFirst, isLast) {
  if (isFirst) return "🚗";
  if (isLast) return "📍";
  switch (maneuver) {
    case "straight": return "⬆️";
    case "slight-right": return "↗️";
    case "turn-right": return "➡️";
    case "sharp-right": return "↘️";
    case "slight-left": return "↖️";
    case "turn-left": return "⬅️";
    case "sharp-left": return "↙️";
    default: return "•";
  }
}

/**
 * Generate turn-by-turn instructions from route coordinates
 * @param {Array} coordinates - Array of {lat, lng} objects
 * @param {Array} roadNames - Array of road names for each segment (optional)
 * @returns {Array} Instructions with distance, maneuver, and text
 */
export function generateDirections(coordinates, roadNames = []) {
  if (!coordinates || coordinates.length < 2) return [];
  
  const instructions = [];
  let cumulativeDistance = 0;
  
  // Calculate total distance and segment distances
  const segments = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dist = distanceMeters(
      coordinates[i].lat, coordinates[i].lng,
      coordinates[i + 1].lat, coordinates[i + 1].lng
    );
    segments.push({
      start: coordinates[i],
      end: coordinates[i + 1],
      distance: dist,
      cumulativeStart: cumulativeDistance,
      cumulativeEnd: cumulativeDistance + dist,
      roadName: roadNames[i] || null
    });
    cumulativeDistance += dist;
  }
  
  const totalDistance = cumulativeDistance;
  
  // First instruction
  instructions.push({
    distance: 0,
    maneuver: "start",
    instruction: "Head toward your destination",
    icon: "🚗",
    cumulativeDistance: 0
  });
  
  // Detect turns by comparing bearing changes
  let lastBearing = null;
  
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const bearing = calculateBearing(
      seg.start.lat, seg.start.lng,
      seg.end.lat, seg.end.lng
    );
    
    if (lastBearing !== null) {
      let angleChange = bearing - lastBearing;
      if (angleChange > 180) angleChange -= 360;
      if (angleChange < -180) angleChange += 360;
      
      const maneuver = getManeuver(angleChange);
      
      // Only add instruction if it's not a small straight movement
      if (Math.abs(angleChange) > 12) {
        const distanceToTurn = seg.cumulativeStart;
        const roadName = seg.roadName;
        const instructionText = getInstruction(maneuver, distanceToTurn, roadName, false, false);
        const icon = getTurnIcon(maneuver, false, false);
        
        instructions.push({
          distance: distanceToTurn,
          maneuver,
          instruction: instructionText,
          icon,
          point: seg.start,
          roadName
        });
      }
    }
    
    lastBearing = bearing;
  }
  
  // Add destination instruction
  instructions.push({
    distance: totalDistance,
    maneuver: "destination",
    instruction: "You have arrived at your destination",
    icon: "📍",
    isDestination: true
  });
  
  return instructions;
}

/**
 * Find the next upcoming turn based on current position
 */
export function findNextTurn(instructions, distanceFromStart, lookaheadMeters = 300) {
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst.distance > distanceFromStart && 
        inst.distance - distanceFromStart <= lookaheadMeters) {
      return {
        ...inst,
        distanceRemaining: inst.distance - distanceFromStart
      };
    }
  }
  return null;
}

/**
 * Check if user has reached destination
 */
export function hasReachedDestination(distanceFromStart, totalDistance, threshold = 30) {
  return (totalDistance - distanceFromStart) <= threshold;
}