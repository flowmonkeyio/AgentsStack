/**
 * Request context with trace ID for distributed tracing.
 * This context should be passed as the FIRST argument to all methods.
 */
export interface RequestContext {
  trace_id: string;
}

/**
 * Extended context with additional metadata
 */
export interface ExtendedContext extends RequestContext {
  job_id?: string;
  work_id?: string;
  user_id?: string;
}

/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
