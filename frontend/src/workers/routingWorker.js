// workers/routingWorker.js
// Persistent worker that builds and owns the graph
// No DOM dependencies

import { buildGraphWorker } from "./graphBuilderWorker";
import { findShortestPath } from "../services/routing";
import { buildRouteContext, getActiveWarnings } from "../services/costFunction";

// Distance calculation for snapping (in meters)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Find closest node
function findClosestNode(graph, lat, lng) {
  if (!graph || !graph.nodes || Object.keys(graph.nodes).length === 0) {
    return null;
  }
  
  let closestNodeId = null;
  let minDistance = Infinity;
  
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const dist = calculateDistance(lat, lng, node.lat, node.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestNodeId = nodeId;
    }
  }
  
  return closestNodeId;
}

let graph = null;
let isGraphReady = false;
let approvedReports = [];

function sendToMain(type, data = {}) {
  self.postMessage({ type, ...data });
}

async function buildGraphInWorker() {
  console.log("[Worker] Building graph...");
  
  try {
    const graphData = await buildGraphWorker();
    
    if (graphData && Object.keys(graphData.nodes).length > 0) {
      graph = graphData;
      isGraphReady = true;
      
      sendToMain("GRAPH_READY", {
        nodeCount: Object.keys(graph.nodes).length,
        edgeCount: graph.edges.length
      });
      
      console.log("[Worker] Graph ready —", Object.keys(graph.nodes).length, "nodes");
    } else {
      throw new Error("No graph data returned");
    }
  } catch (error) {
    console.error("[Worker] Graph build error:", error);
    sendToMain("GRAPH_ERROR", { error: error.message });
  }
}

function calculateRoute(startLat, startLng, destLat, destLng, profileKey, vehicleMode = "walk") {
  if (!graph || !isGraphReady) {
    sendToMain("ROUTE_ERROR", { error: "Graph not ready" });
    return;
  }
  
  try {
    const startNodeId = findClosestNode(graph, startLat, startLng);
    const destNodeId = findClosestNode(graph, destLat, destLng);
    
    if (!startNodeId || !destNodeId) {
      sendToMain("ROUTE_ERROR", { error: "Could not snap points to road network" });
      return;
    }
    
    console.log("[Worker] Finding path from", startNodeId, "to", destNodeId, "for", vehicleMode);
  
    const path = findShortestPath(graph, startNodeId, destNodeId, profileKey, vehicleMode, approvedReports);
    
    if (!path) {
      sendToMain("ROUTE_ERROR", { error: "No path found" });
      return;
    }
    
    // Build context and get warnings using the costFunction system
    const context = buildRouteContext();
    const warnings = getActiveWarnings(context, profileKey, vehicleMode);
    
    sendToMain("ROUTE_RESULT", { path, warnings });
    console.log("[Worker] Route found —", path.totalDistanceKm?.toFixed(2), "km");
    
  } catch (error) {
    console.error("[Worker] Route error:", error);
    sendToMain("ROUTE_ERROR", { error: error.message });
  }
}

self.onmessage = function(e) {
  const { type, startLat, startLng, destLat, destLng, profileKey, vehicleMode, reports } = e.data;
  
  if (type === "CALCULATE_ROUTE") {
    calculateRoute(startLat, startLng, destLat, destLng, profileKey, vehicleMode);
  }

  if (type === "UPDATE_REPORTS" && Array.isArray(reports)) {
    approvedReports = reports;
    console.log("[Worker] Updated approved reports:", reports.length);
  }
};

buildGraphInWorker();