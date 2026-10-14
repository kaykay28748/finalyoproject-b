// Re-export shim. distance helpers now live in shared/routing/utils/ so the
// backend can import the exact same code. Kept so existing frontend importers
// (App.jsx, graphBuilder.js, geocoding.js, routing engine) keep working.
export * from "../../../../shared/routing/utils/distance.js";
