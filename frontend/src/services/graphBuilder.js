// services/graphBuilder.js
// Fetches road network from OpenStreetMap and builds a graph for A*

import { UG_BOUNDS } from "../function/utils/bounds";
import { distanceKm } from "../function/utils/distance";
import { getCachedGraph, cacheGraph } from "./cacheStore";
import { API_URL } from "../config";

const OVERPASS_PROXY = `${API_URL}/api/overpass`;

function getBoundsValues(bounds) {
  if (bounds?._southWest && bounds?._northEast) {
    return {
      south: bounds._southWest.lat,
      west:  bounds._southWest.lng,
      north: bounds._northEast.lat,
      east:  bounds._northEast.lng,
    };
  }
  return { south: 5.62, west: -0.21, north: 5.672, east: -0.175 };
}

const getOSMQuery = (bounds) => {
  const { south, west, north, east } = getBoundsValues(bounds);
  return `
    [out:json][timeout:45];
    (
      way["highway"~"cycleway|footway|path|pedestrian|steps|residential|service|track|bridleway|living_street|unclassified|tertiary|secondary|primary|tertiary_link|secondary_link"](${south},${west},${north},${east});
      node(w);
    );
    out body;
    >;
    out skel qt;
  `;
};

async function fetchWithRetry(url, query, retries = 5) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, {
        method:  "POST",
        body:    query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal:  controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) return response;

      if (response.status === 429) {
        const wait = Math.min(5000 * Math.pow(2, i), 30000);
        console.warn(`[GraphBuilder] Rate limited (429), waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      console.warn(`[GraphBuilder] Attempt ${i + 1} failed: HTTP ${response.status}`);
    } catch (error) {
      console.warn(`[GraphBuilder] Attempt ${i + 1} failed:`, error.message);
    }
    if (i < retries) await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('All fetch attempts failed');
}

export async function buildGraph() {
  try {
    const cached = await getCachedGraph();
    if (cached) {
      console.log("[GraphBuilder] Using cached graph from IndexedDB");
      return cached;
    }

    console.log("[GraphBuilder] Fetching OSM data for Legon...");
    const query = getOSMQuery(UG_BOUNDS);

    let response;
    try {
      response = await fetchWithRetry(OVERPASS_PROXY, query);
    } catch {
      console.log("[GraphBuilder] All proxy retries exhausted");
      response = null;
    }

    if (!response) throw new Error('No response from Overpass API');

    const data = await response.json();
    console.log(`[GraphBuilder] Received ${data.elements?.length || 0} elements`);

    if (!data.elements?.length) {
      console.warn("[GraphBuilder] No OSM data returned");
      return null;
    }

    let graph = processOSMData(data.elements);
    if (!graph || !Object.keys(graph.nodes).length) {
      console.warn("[GraphBuilder] Graph empty after processing");
      return null;
    }

    graph = addManualPedestrianConnections(graph, 25);
    graph = { nodes: graph.nodes, edges: graph.edges };
    graph = connectNearbyNodes(graph, 15);

    const components = findConnectedComponents(graph);
    console.log(
      `[GraphBuilder] Ready — ${Object.keys(graph.nodes).length} nodes, ` +
      `${graph.edges.length} edges, ${components.length} component(s)`
    );

    await cacheGraph(graph);
    return graph;

  } catch (error) {
    console.error("[GraphBuilder] Error:", error);
    return null;
  }
}

function processOSMData(elements) {
  const nodes = {};
  const ways  = [];

  elements.forEach((el) => {
    if (el.type === "node") {
      nodes[String(el.id)] = { id: String(el.id), lat: el.lat, lng: el.lon, neighbors: [] };
    } else if (el.type === "way" && el.tags?.highway && el.nodes?.length > 0) {
      const t = el.tags.highway;
      if (t === 'motorway' || t === 'motorway_link') return;
      ways.push({ id: String(el.id), nodes: el.nodes.map(String), tags: el.tags, type: t });
    }
  });

  console.log(`[GraphBuilder] ${Object.keys(nodes).length} nodes, ${ways.length} ways`);

  const edges   = [];
  const edgeSet = new Set();
  let edgeCount = 0, skippedCount = 0;

  ways.forEach((way) => {
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const fromId = way.nodes[i];
      const toId   = way.nodes[i + 1];

      if (!nodes[fromId] || !nodes[toId]) { skippedCount++; continue; }

      const from       = nodes[fromId];
      const to         = nodes[toId];
      const distMetres = distanceKm(from.lat, from.lng, to.lat, to.lng) * 1000;

      if (distMetres < 0.5) continue;

      const edgeKey    = `${fromId}-${toId}`;
      const reverseKey = `${toId}-${fromId}`;
      if (edgeSet.has(edgeKey) || edgeSet.has(reverseKey)) continue;

      edgeSet.add(edgeKey);
      edgeCount++;

      edges.push({ id: edgeKey, from: fromId, to: toId, distance: distMetres, tags: way.tags, type: way.type });
      from.neighbors.push({ nodeId: toId,   edgeId: edgeKey, distance: distMetres });
      to.neighbors.push  ({ nodeId: fromId, edgeId: edgeKey, distance: distMetres });
    }
  });

  console.log(`[GraphBuilder] Built ${edgeCount} edges, skipped ${skippedCount}`);

  const connectedNodes = {};
  let isolatedCount    = 0;
  Object.entries(nodes).forEach(([id, node]) => {
    if (node.neighbors.length > 0) connectedNodes[id] = node;
    else isolatedCount++;
  });

  console.log(`[GraphBuilder] ${Object.keys(connectedNodes).length} connected, ${isolatedCount} isolated removed`);
  return { nodes: connectedNodes, edges };
}

function addManualPedestrianConnections(graph, thresholdMeters = 25) {
  const nodes    = graph.nodes;
  const edges    = [...graph.edges];
  const edgeSet  = new Set(graph.edges.map(e => e.id));
  let added      = 0;

  const manualConnections = [
    {
      from: { lat: 5.6482, lng: -0.1878 },
      to:   { lat: 5.6525, lng: -0.1872 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Basic School Connector' }
    },
    {
      from: { lat: 5.6525, lng: -0.1872 },
      to:   { lat: 5.6548, lng: -0.1863 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Nsia-Akuafo Link' }
    },
    {
      from: { lat: 5.6548, lng: -0.1863 },
      to:   { lat: 5.6565, lng: -0.1848 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Akuafo-Onyaa Link' }
    },
    {
      from: { lat: 5.6565, lng: -0.1848 },
      to:   { lat: 5.6590, lng: -0.1832 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Onyaa-Boateng Link' }
    },
    {
      from: { lat: 5.6590, lng: -0.1832 },
      to:   { lat: 5.6620, lng: -0.1818 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Boateng-Engineering Link' }
    },
    {
      from: { lat: 5.6508, lng: -0.1868 },
      to:   { lat: 5.6542, lng: -0.1858 },
      // Grass shortcut — surface penalty will naturally discourage unless it's
      // genuinely shorter, which is the right behaviour
      tags: { highway: 'path', foot: 'yes', surface: 'grass', informal: 'yes', name: 'Field Shortcut' }
    },
    {
      from: { lat: 5.6570, lng: -0.1885 },
      to:   { lat: 5.6582, lng: -0.1868 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Ivan Addae Connector' }
    },
    {
      from: { lat: 5.6535, lng: -0.1865 },
      to:   { lat: 5.6555, lng: -0.1855 },
      tags: { highway: 'path', foot: 'yes', surface: 'paved', name: 'Central Campus Shortcut' }
    },
    {
      from: { lat: 5.6495, lng: -0.1890 },
      to:   { lat: 5.6520, lng: -0.1875 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Legon-Nsia Connector' }
    },
    {
      from: { lat: 5.6490, lng: -0.1870 },
      to:   { lat: 5.6540, lng: -0.1860 },
      tags: { highway: 'path', foot: 'yes', surface: 'paved', name: 'Basic School to Akuafo Direct' }
    },
    {
      from: { lat: 5.6550, lng: -0.1870 },
      to:   { lat: 5.6568, lng: -0.1855 },
      tags: { highway: 'footway', foot: 'yes', surface: 'asphalt', name: 'Central Grid Connector' }
    },
    {
      from: { lat: 5.6510, lng: -0.1880 },
      to:   { lat: 5.6530, lng: -0.1875 },
      tags: { highway: 'path', foot: 'yes', surface: 'paved', name: 'Post Office Shortcut' }
    },
  ];

  function findOrCreateNode(lat, lng) {
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (distanceKm(lat, lng, node.lat, node.lng) * 1000 <= 10) return nodeId;
    }
    const newId      = `manual_${lat.toFixed(6)}_${lng.toFixed(6)}`;
    nodes[newId]     = { id: newId, lat, lng, neighbors: [] };
    return newId;
  }

  for (const conn of manualConnections) {
    const fromId     = findOrCreateNode(conn.from.lat, conn.from.lng);
    const toId       = findOrCreateNode(conn.to.lat,   conn.to.lng);
    if (fromId === toId) continue;

    const edgeKey    = `${fromId}-${toId}`;
    const reverseKey = `${toId}-${fromId}`;
    if (edgeSet.has(edgeKey) || edgeSet.has(reverseKey)) continue;

    const distance   = distanceKm(conn.from.lat, conn.from.lng, conn.to.lat, conn.to.lng) * 1000;
    edgeSet.add(edgeKey);
    added++;

    const newEdge = { id: edgeKey, from: fromId, to: toId, distance, tags: conn.tags, type: conn.tags.highway };
    edges.push(newEdge);
    nodes[fromId].neighbors.push({ nodeId: toId,    edgeId: edgeKey, distance });
    nodes[toId].neighbors.push  ({ nodeId: fromId,  edgeId: edgeKey, distance });
  }

  console.log(`[GraphBuilder] Added ${added} manual connections`);
  return { nodes, edges };
}

function connectNearbyNodes(graph, thresholdMeters = 15) {
  const nodes    = graph.nodes;
  const edges    = [...graph.edges];
  const edgeSet  = new Set(graph.edges.map(e => e.id));
  let added      = 0;
  const nodeList = Object.values(nodes);

  console.log(`[GraphBuilder] Connecting nodes within ${thresholdMeters}m...`);

  // Grid spatial index for O(N) instead of O(N²)
  const GRID_SIZE_DEG = 0.005;
  const grid          = new Map();

  for (const node of nodeList) {
    const cellKey = `${Math.floor(node.lat / GRID_SIZE_DEG)},${Math.floor(node.lng / GRID_SIZE_DEG)}`;
    if (!grid.has(cellKey)) grid.set(cellKey, []);
    grid.get(cellKey).push(node);
  }

  const wellConnected = new Set(nodeList.filter(n => n.neighbors.length >= 2).map(n => n.id));

  for (const [cellKey, cellNodes] of grid.entries()) {
    const [cellX, cellY] = cellKey.split(',').map(Number);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const adjacent = grid.get(`${cellX + dx},${cellY + dy}`);
        if (!adjacent) continue;

        for (const nodeA of cellNodes) {
          if (nodeA.neighbors.length > 6) continue;

          for (const nodeB of adjacent) {
            if (nodeA.id === nodeB.id) continue;
            if (wellConnected.has(nodeA.id) && wellConnected.has(nodeB.id)) continue;

            const dist = distanceKm(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng) * 1000;
            if (dist > thresholdMeters || dist < 0.5) continue;

            const edgeKey    = `${nodeA.id}-${nodeB.id}`;
            const reverseKey = `${nodeB.id}-${nodeA.id}`;
            if (edgeSet.has(edgeKey) || edgeSet.has(reverseKey)) continue;

            edgeSet.add(edgeKey);
            added++;

            // Tag as footway so it gets the correct pedestrian cost (0.9)
            // rather than falling through to the 1.3 unknown fallback
            const newEdge = {
              id:       edgeKey,
              from:     nodeA.id,
              to:       nodeB.id,
              distance: dist,
              tags:     { highway: 'footway' },
              type:     'footway',
            };

            edges.push(newEdge);
            nodeA.neighbors.push({ nodeId: nodeB.id, edgeId: edgeKey, distance: dist });
            nodeB.neighbors.push({ nodeId: nodeA.id, edgeId: edgeKey, distance: dist });
          }
        }
      }
    }
  }

  console.log(`[GraphBuilder] Added ${added} proximity connections`);
  return { nodes, edges };
}

export function findConnectedComponents(graph) {
  const visited    = new Set();
  const components = [];

  for (const nodeId of Object.keys(graph.nodes)) {
    if (visited.has(nodeId)) continue;
    const component = new Set();
    const queue     = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current    = queue.shift();
      component.add(current);
      for (const n of (graph.nodes[current]?.neighbors || [])) {
        if (!visited.has(n.nodeId)) { visited.add(n.nodeId); queue.push(n.nodeId); }
      }
    }
    components.push(component);
  }
  return components;
}

export function findClosestNode(graph, lat, lng) {
  if (!graph || !Object.keys(graph.nodes).length) {
    console.warn("[GraphBuilder] Cannot find closest node — graph empty");
    return null;
  }

  let closestId  = null;
  let minDist    = Infinity;

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const dist = distanceKm(lat, lng, node.lat, node.lng);
    if (dist < minDist) { minDist = dist; closestId = nodeId; }
  }
  return closestId;
}