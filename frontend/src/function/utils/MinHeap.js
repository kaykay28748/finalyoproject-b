// Re-export shim. MinHeap now lives in shared/routing/utils/ so the backend can
// import the exact same code. Kept so existing frontend importers keep working.
export * from "../../../../shared/routing/utils/MinHeap.js";
