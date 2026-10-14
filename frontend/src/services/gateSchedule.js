// Re-export shim. The gate schedule now lives in shared/routing/ so the backend
// can import the exact same code. Kept so every existing frontend importer of
// "services/gateSchedule" keeps working unchanged.
export * from "../../../shared/routing/gateSchedule.js";
