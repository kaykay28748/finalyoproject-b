// Re-export shim. The cost function now lives in shared/routing/ so the backend
// can import the exact same code. Kept so every existing frontend importer of
// "services/costFunction" (and the admissibility script) keeps working unchanged.
export * from "../../../shared/routing/costFunction.js";
