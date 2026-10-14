// Re-export shim. The routing engine now lives in shared/routing/ so the backend
// can import the exact same code. Kept so every existing frontend importer of
// "services/routing" keeps working unchanged.
export * from "../../../shared/routing/routing.js";
