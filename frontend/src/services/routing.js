// services/routing.js
// A* algorithm with min-heap priority queue for optimal performance
// Carries incoming bearing in the queue so turn penalties can be applied per edge

import { calculateEdgeCost, buildRouteContext, getActiveWarnings, getBearing, PROFILES } from "./costFunction";
import { distanceKm } from "../function/utils/distance";
import { MinHeap }    from "../function/utils/MinHeap";

/**
 * Simplifies a coordinate array using the Ramer-Douglas-Peucker algorithm.
 * Keeps the path accurate to the given tolerance (in degrees).
 */
function simplifyPath(coords, tolerance = 0.00005) {
  if (coords.length <= 2) return coords;

  let maxDist  = 0;
  let maxIndex = 0;
  const start  = coords[0];
  const end    = coords[coords.length - 1];

  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], start, end);
    if (dist > maxDist) { maxDist = dist; maxIndex = i; }
  }

  if (maxDist <= tolerance) return [start, end];

  const left  = simplifyPath(coords.slice(0, maxIndex + 1), tolerance);
  const right = simplifyPath(coords.slice(maxIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * A* admissible heuristic: straight-line distance to destination.
 * Must be <= actual cost to guarantee optimality.
 * We use raw distance (no multipliers) so it never over-estimates.
 */
function heuristicCost(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestNode(graph, lat, lng, maxDistanceDegrees = 0.01) {
  if (!graph?.nodes) return null;

  let minDist   = Infinity;
  let nearestId = null;

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const dist = Math.hypot(node.lat - lat, node.lng - lng);
    if (dist < minDist && dist < maxDistanceDegrees) {
      minDist   = dist;
      nearestId = nodeId;
    }
  }

  return nearestId;
}

/**
 * Finds the optimal path between two nodes using A* with turn penalties.
 */
export function findShortestPath(
  graph,
  startNodeId,
  endNodeId,
  profileKey  = "standard",
  vehicleMode = "walk",
  approvedReports = []
) {
  if (!graph?.nodes || !graph?.edges) {
    console.error("[Routing] Invalid graph");
    return null;
  }

  const nodes   = graph.nodes;
  const endNode = nodes[endNodeId];

  if (!nodes[startNodeId] || !endNode) {
    console.error("[Routing] Start or end node not found");
    return null;
  }

  if (startNodeId === endNodeId) {
    return {
      nodes:           [startNodeId],
      coordinates:     [{ lat: nodes[startNodeId].lat, lng: nodes[startNodeId].lng }],
      totalDistance:   0,
      totalDistanceKm: 0,
      isFallback:      false,
      profile:         profileKey,
      vehicleMode,
      roadNames:       [],
    };
  }

  const context = buildRouteContext();
  const profile = PROFILES[profileKey] || PROFILES.standard;

  // Build edge lookup map once — O(E), then O(1) per lookup during traversal.
  const edgeMap = {};
  for (const edge of graph.edges) {
    const fromNode = nodes[edge.from];
    const toNode   = nodes[edge.to];
    if (!fromNode || !toNode) continue;

    const enriched = {
      ...edge,
      fromLat: fromNode.lat,
      fromLng: fromNode.lng,
      toLat:   toNode.lat,
      toLng:   toNode.lng,
    };

    edgeMap[`${edge.from}-${edge.to}`] = enriched;
    edgeMap[`${edge.to}-${edge.from}`] = {
      ...enriched,
      from:    edge.to,
      to:      edge.from,
      fromLat: toNode.lat,
      fromLng: toNode.lng,
      toLat:   fromNode.lat,
      toLng:   fromNode.lng,
    };
  }

  // A* with min-heap
  const gScore   = {};
  const previous = {};
  const visited  = new Set();
  const heap     = new MinHeap();

  for (const nodeId in nodes) {
    gScore[nodeId]   = Infinity;
    previous[nodeId] = null;
  }

  gScore[startNodeId] = 0;
  const startH = heuristicCost(
    nodes[startNodeId].lat, nodes[startNodeId].lng,
    endNode.lat, endNode.lng
  );
  heap.push({ nodeId: startNodeId, incomingBearing: null }, startH);

  let nodesExplored = 0;

  while (heap.size > 0) {
    const { value: state } = heap.pop();
    const { nodeId: current, incomingBearing } = state;

    nodesExplored++;

    if (current === endNodeId) {
      console.log(`[Routing] A* explored ${nodesExplored} nodes`);
      break;
    }

    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors  = nodes[current].neighbors || [];
    const currentG   = gScore[current];
    const currentNode = nodes[current];

    const goalBearing = getBearing(
      currentNode.lat, currentNode.lng,
      endNode.lat, endNode.lng
    );

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.nodeId)) continue;

      const edgeKey = `${current}-${neighbor.nodeId}`;
      const edge    = edgeMap[edgeKey] || {
        distance: neighbor.distance,
        tags:     {},
        type:     "residential",
        from:     current,
        to:       neighbor.nodeId,
        fromLat:  currentNode.lat,
        fromLng:  currentNode.lng,
        toLat:    nodes[neighbor.nodeId]?.lat ?? currentNode.lat,
        toLng:    nodes[neighbor.nodeId]?.lng ?? currentNode.lng,
      };

      const outgoingBearing = getBearing(
        edge.fromLat, edge.fromLng,
        edge.toLat,   edge.toLng
      );

      const edgeCost = calculateEdgeCost(
        edge,
        profile,
        context.timePeriod,
        context.vehicleRestricted,
        context.currentHour,
        vehicleMode,
        incomingBearing,
        goalBearing,
        undefined,
        approvedReports
      );

      const tentativeG = currentG + edgeCost;

      if (tentativeG < gScore[neighbor.nodeId]) {
        previous[neighbor.nodeId] = { from: current, bearing: outgoingBearing };
        gScore[neighbor.nodeId]   = tentativeG;

        const h = heuristicCost(
          nodes[neighbor.nodeId].lat, nodes[neighbor.nodeId].lng,
          endNode.lat, endNode.lng
        );

        heap.push(
          { nodeId: neighbor.nodeId, incomingBearing: outgoingBearing },
          tentativeG + h
        );
      }
    }
  }

  // No path found
  if (gScore[endNodeId] === Infinity) {
    const s          = nodes[startNodeId];
    const e          = nodes[endNodeId];
    const directDist = distanceKm(s.lat, s.lng, e.lat, e.lng) * 1000;

    if (directDist <= 500) {
      console.log(`[Routing] Fallback direct connection — ${directDist.toFixed(1)}m`);
      return {
        nodes:           [startNodeId, endNodeId],
        coordinates:     [{ lat: s.lat, lng: s.lng }, { lat: e.lat, lng: e.lng }],
        totalDistance:   directDist,
        totalDistanceKm: directDist / 1000,
        isFallback:      true,
        profile:         profileKey,
        vehicleMode,
        context,
        roadNames:       [],
      };
    }

    console.warn(`[Routing] No path found — direct distance ${directDist.toFixed(1)}m exceeds fallback`);
    return null;
  }

  // Reconstruct path
  const pathNodeIds = [];
  let current = endNodeId;
  while (current !== null) {
    pathNodeIds.unshift(current);
    const prev = previous[current];
    current = prev ? prev.from : null;
  }

  // Extract road names for each segment
  const roadNames = [];
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const fromId = pathNodeIds[i];
    const toId = pathNodeIds[i + 1];
    const edgeKey = `${fromId}-${toId}`;
    const edge = edgeMap[edgeKey];
    const roadName = edge?.tags?.name || null;
    roadNames.push(roadName);
  }

  // Physical distance (unweighted) for display
  let actualDistMetres = 0;
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const a = nodes[pathNodeIds[i]];
    const b = nodes[pathNodeIds[i + 1]];
    actualDistMetres += distanceKm(a.lat, a.lng, b.lat, b.lng) * 1000;
  }

  const rawCoords        = pathNodeIds.map(id => [nodes[id].lat, nodes[id].lng]);
  const simplifiedCoords = simplifyPath(rawCoords);

  console.log(
    `[Routing] Path — ${pathNodeIds.length} nodes → ${simplifiedCoords.length} simplified, ` +
    `${(actualDistMetres / 1000).toFixed(2)}km`
  );

  return {
    nodes:           pathNodeIds,
    coordinates:     simplifiedCoords.map(([lat, lng]) => ({ lat, lng })),
    totalDistance:   actualDistMetres,
    totalDistanceKm: actualDistMetres / 1000,
    weightedCost:    gScore[endNodeId],
    isFallback:      false,
    profile:         profileKey,
    vehicleMode,
    context,
    roadNames, // ← ROAD NAMES FOR DIRECTIONS
  };
}

/**
 * Calculates all four route variants.
 */
export async function getAllRoutes(
  graph,
  startNodeId,
  endNodeId,
  profileKey  = "standard",
  vehicleMode = "walk",
  approvedReports = []
) {
  const startTime = performance.now();

  const [standard, fastest, accessible, night] = await Promise.all([
    Promise.resolve(findShortestPath(graph, startNodeId, endNodeId, "standard",   vehicleMode, approvedReports)),
    Promise.resolve(findShortestPath(graph, startNodeId, endNodeId, "fastest",    vehicleMode, approvedReports)),
    Promise.resolve(findShortestPath(graph, startNodeId, endNodeId, "accessible", vehicleMode, approvedReports)),
    Promise.resolve(findShortestPath(graph, startNodeId, endNodeId, "night",      vehicleMode, approvedReports)),
  ]);

  const elapsed = performance.now() - startTime;
  console.log(`[Routing] All 4 routes in ${elapsed.toFixed(0)}ms (vehicle: ${vehicleMode})`);

  if (standard?.context)   standard.context.warnings   = getActiveWarnings(standard.context,   "standard",   vehicleMode);
  if (fastest?.context)    fastest.context.warnings     = getActiveWarnings(fastest.context,    "fastest",    vehicleMode);
  if (accessible?.context) accessible.context.warnings  = getActiveWarnings(accessible.context, "accessible", vehicleMode);
  if (night?.context)      night.context.warnings       = getActiveWarnings(night.context,      "night",      vehicleMode);

  return { standard, fastest, accessible, night, timestamp: Date.now() };
}