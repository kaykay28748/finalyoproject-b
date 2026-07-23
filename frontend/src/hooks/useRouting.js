// // hooks/useRouting.js
// // Preloads graph silently in background after mount so the user never waits
// // Dijkstra runs in a Web Worker to keep the main thread free

// import { useState, useEffect, useRef } from "react";
// import { buildGraph } from "../services/graphBuilder";

// // ── Graph cache (module-level singleton) ──────────────────────────────────────
// // Survives React StrictMode double-invoke so Overpass is only called once
// let graphCache   = null;
// let graphPromise = null;

// function getGraph() {
//   if (graphCache)   return Promise.resolve(graphCache);
//   if (graphPromise) return graphPromise;

//   graphPromise = buildGraph().then((g) => {
//     graphCache   = g;
//     graphPromise = null;
//     return g;
//   });

//   return graphPromise;
// }

// /**
//  * useRouting — graph preloads silently after mount
//  * Route calculates instantly when Show on Map is pressed
//  *
//  * @param {Object}  startPoint - { lat, lng }
//  * @param {Object}  destPoint  - { lat, lng }
//  * @param {boolean} triggered  - Starts route calc when true
//  * @param {string}  profileKey - Active routing profile
//  */
// export function useRouting(startPoint, destPoint, triggered, profileKey = "standard") {
//   const [graph, setGraph]         = useState(null);
//   const [route, setRoute]         = useState(null);
//   const [warnings, setWarnings]   = useState([]);
//   const [error, setError]         = useState(null);
//   const [isGraphReady, setIsGraphReady] = useState(false);
//   const [isRouting, setIsRouting] = useState(false); // true while worker is running

//   const graphLoadStarted = useRef(false);
//   const workerRef        = useRef(null); // holds active worker so we can terminate it

//   // ── Terminate worker on unmount ─────────────────────────────────────────────
//   useEffect(() => {
//     return () => {
//       if (workerRef.current) {
//         workerRef.current.terminate();
//         workerRef.current = null;
//       }
//     };
//   }, []);

//   // ── Preload graph silently after mount ──────────────────────────────────────
//   // Runs once — graph is ready before user finishes setting their points
//   useEffect(() => {
//     if (graphLoadStarted.current) return;
//     graphLoadStarted.current = true;

//     console.log("[useRouting] Preloading graph in background...");

//     getGraph()
//       .then((graphData) => {
//         if (graphData && Object.keys(graphData.nodes).length > 0) {
//           setGraph(graphData);
//           setIsGraphReady(true);
//           console.log("[useRouting] Graph ready —", Object.keys(graphData.nodes).length, "nodes");
//         } else {
//           console.error("[useRouting] Graph data invalid");
//           setError("Failed to load road network");
//         }
//       })
//       .catch((err) => {
//         console.error("[useRouting] Graph preload error:", err.message);
//         setError("Failed to load road network");
//       });
//   }, []);

//   // ── Route calculation ───────────────────────────────────────────────────────
//   // Only runs when triggered — graph is already ready so this is near-instant
//   useEffect(() => {
//     if (!triggered) {
//       setRoute(null);
//       setWarnings([]);
//       setError(null);
//       return;
//     }

//     if (!graph || !isGraphReady) {
//       console.log("[useRouting] Graph still loading...");
//       return;
//     }

//     if (!startPoint || !destPoint) return;

//     // Terminate any previous worker still running
//     if (workerRef.current) {
//       workerRef.current.terminate();
//       workerRef.current = null;
//     }

//     async function calculateRoute() {
//       setIsRouting(true);
//       setError(null);

//       try {
//         // Spawn worker — node snapping AND Dijkstra both run off the main thread
//         // Previously findClosestNode ran here (O(n) loop blocking main thread = INP killer)
//         const worker = new Worker(
//           new URL("../workers/routingWorker.js", import.meta.url),
//           { type: "module" }
//         );
//         workerRef.current = worker;

//         // Send raw coordinates — worker handles snapping and routing
//         worker.postMessage({
//           graph,
//           startLat:  startPoint.lat,
//           startLng:  startPoint.lng,
//           destLat:   destPoint.lat,
//           destLng:   destPoint.lng,
//           profileKey,
//         });

//         worker.onmessage = (e) => {
//           const { path, warnings: activeWarnings, error: workerError } = e.data;

//           if (workerError) {
//             console.error("[useRouting] Worker error:", workerError);
//             setError(workerError);
//             setRoute(null);
//             setWarnings([]);
//           } else {
//             console.log("[useRouting] Route received —", path?.totalDistanceKm?.toFixed(2), "km");
//             setRoute(path);
//             setWarnings(activeWarnings || []);
//           }

//           setIsRouting(false);
//           worker.terminate();
//           workerRef.current = null;
//         };

//         worker.onerror = (err) => {
//           console.error("[useRouting] Worker crashed:", err.message);
//           setError("Route calculation failed");
//           setIsRouting(false);
//           workerRef.current = null;
//         };

//       } catch (err) {
//         console.error("[useRouting] Route error:", err.message);
//         setError(err.message);
//         setRoute(null);
//         setWarnings([]);
//         setIsRouting(false);
//       }
//     }

//     calculateRoute();

//     // Terminate worker if deps change before it finishes
//     return () => {
//       if (workerRef.current) {
//         workerRef.current.terminate();
//         workerRef.current = null;
//       }
//     };

//   }, [graph, isGraphReady, startPoint, destPoint, triggered, profileKey]);

//   return { route, warnings, isGraphReady, isRouting, error };
// }


// hooks/useRouting.js
// Graph builds inside a persistent worker — main thread never touches the graph
// This eliminates structured cloning overhead and keeps UI responsive

// hooks/useRouting.js
// Graph builds inside a persistent worker — main thread never touches the graph

import { useState, useEffect, useRef } from "react";
import { API_URL } from "../config";

export function useRouting(startPoint, destPoint, triggered, profileKey = "standard", vehicleMode = "walk") {
  const [route, setRoute] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState(null);
  const [isGraphReady, setIsGraphReady] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  const workerRef = useRef(null);
  const prevPointsRef = useRef(""); // Correctly placed at top level

  // ── Spawn persistent worker once on mount ─────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/routingWorker.js", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, path, warnings: activeWarnings, error: workerError, nodeCount } = e.data;

      if (type === "GRAPH_READY") {
        setIsGraphReady(true);
        console.log("[useRouting] Graph ready in worker —", nodeCount, "nodes");

      } else if (type === "GRAPH_ERROR") {
        setError(workerError);
        console.error("[useRouting] Worker graph error:", workerError);

      } else if (type === "ROUTE_RESULT") {
        setRoute(path);
        setWarnings(activeWarnings || []);
        setIsRouting(false);
        console.log("[useRouting] Route received —", path?.totalDistanceKm?.toFixed(2), "km");

      } else if (type === "ROUTE_ERROR") {
        setError(workerError);
        setRoute(null);
        setWarnings([]);
        setIsRouting(false);
        console.error("[useRouting] Route error:", workerError);
      }
    };

    worker.onerror = (err) => {
      console.error("[useRouting] Worker crashed:", err.message);
      setError("Routing failed — please refresh");
      setIsRouting(false);
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ── Fetch approved reports and send to worker ────────────────────────────────
  const reportsRef = useRef([]);

  const fetchApprovedReports = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reports/approved`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.reports)) {
        reportsRef.current = data.reports;
        workerRef.current?.postMessage({
          type: "UPDATE_REPORTS",
          reports: data.reports,
        });
      }
    } catch (err) {
      console.warn("[useRouting] Failed to fetch approved reports:", err.message);
    }
  };

  useEffect(() => {
    if (!isGraphReady) return;
    fetchApprovedReports();
    const interval = setInterval(fetchApprovedReports, 60000);
    return () => clearInterval(interval);
  }, [isGraphReady]);

  // ── Send route request to worker ──────────────────────────────────────────
  useEffect(() => {
    if (!triggered) return;

    if (!startPoint || !destPoint) return;

    if (!isGraphReady) {
      return;
    }

    // Stable key using 6-decimal precision (~11cm) to prevent unnecessary loading states
    const currentPointsKey = `${Number(startPoint.lat).toFixed(6)},${Number(startPoint.lng).toFixed(6)}-${Number(destPoint.lat).toFixed(6)},${Number(destPoint.lng).toFixed(6)}`;
    const destinationChanged = prevPointsRef.current !== currentPointsKey;
    prevPointsRef.current = currentPointsKey;

    setError(null);

    // Only show the loading state if the destination changed.
    // If only the profileKey changed, we keep the old route visible until the new one is calculated.
    if (destinationChanged || !route) {
      setIsRouting(true);
    }

    workerRef.current?.postMessage({
      type: "CALCULATE_ROUTE",
      startLat: startPoint.lat,
      startLng: startPoint.lng,
      destLat: destPoint.lat,
      destLng: destPoint.lng,
      profileKey,
      vehicleMode,
    });

  }, [startPoint, destPoint, triggered, profileKey, vehicleMode, isGraphReady]);

  return { route, warnings, isGraphReady, isRouting, error };
}