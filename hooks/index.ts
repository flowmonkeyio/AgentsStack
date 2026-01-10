// Legacy hook (simple implementation)
export { useJobStream as useJobStreamLegacy } from "./use-job-stream";

// New hook with full reconnection logic (as per TECH_DESIGN.md)
export { useJobStream, DEFAULT_RECONNECTION_CONFIG } from "./useJobStream";
export type {
  ReconnectionConfig,
  ConnectionState,
  JobState,
  WorkItemDisplay,
  OutputContent,
  ImageOutput,
  WorkItemOutput,
  ReasoningEntry,
  UseJobStreamReturn,
} from "./useJobStream";
