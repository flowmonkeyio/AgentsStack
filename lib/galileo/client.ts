/**
 * Galileo Client Implementation
 *
 * Provides verification (instruction adherence) and observability (tracing)
 * capabilities using the Galileo AI API.
 *
 * @see /docs/designs/galileo/TECH_DESIGN.md
 */

import type {
  GalileoClient,
  GalileoConfig,
  GalileoError,
  GalileoErrorCode,
  VerifyRequest,
  VerifyResponse,
  TraceEvent,
  TraceableInput,
  QualityMetrics,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 1000;
const GALILEO_API_BASE_URL = "https://api.galileo.ai/v1";

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Create a GalileoError with proper typing.
 */
function createGalileoError(
  message: string,
  code: GalileoErrorCode,
  statusCode?: number
): GalileoError {
  const error = new Error(message) as GalileoError;
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = code === "RATE_LIMITED" || code === "NETWORK_ERROR" || code === "TIMEOUT";
  return error;
}

/**
 * Map HTTP status codes to GalileoErrorCode.
 */
function mapStatusToErrorCode(status: number): GalileoErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (status === 400) return "INVALID_INPUT";
  if (status >= 500) return "API_ERROR";
  return "API_ERROR";
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a unique trace ID.
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `trace_${timestamp}_${random}`;
}

/**
 * Sanitize input/output for tracing to remove sensitive data.
 */
export function sanitize<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item)) as T;
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "apiKey", "api_key", "secret", "token", "authorization"];

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Delay execution for the specified milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// GALILEO CLIENT IMPLEMENTATION
// =============================================================================

/**
 * Internal state and configuration for the client.
 */
interface GalileoClientState {
  apiKey: string;
  projectId: string;
  environment: "development" | "production";
  baseUrl: string;
}

/**
 * Create the fetch options for API calls.
 */
function createFetchOptions(
  state: GalileoClientState,
  method: string,
  body?: unknown
): RequestInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${state.apiKey}`,
    "X-Galileo-Project-Id": state.projectId,
    "X-Galileo-Environment": state.environment,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  return options;
}

/**
 * Make an API request with error handling.
 */
async function apiRequest<T>(
  state: GalileoClientState,
  endpoint: string,
  method: string,
  body?: unknown
): Promise<T> {
  const url = `${state.baseUrl}${endpoint}`;
  const options = createFetchOptions(state, method, body);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    options.signal = controller.signal;

    const response = await fetch(url, options);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorCode = mapStatusToErrorCode(response.status);
      let errorMessage = `Galileo API error: ${response.status}`;

      try {
        const errorBody = await response.json() as { message?: string };
        if (errorBody.message) {
          errorMessage = errorBody.message;
        }
      } catch {
        // Ignore JSON parse errors for error responses
      }

      throw createGalileoError(errorMessage, errorCode, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createGalileoError("Request timeout", "TIMEOUT");
    }
    if ((error as GalileoError).code) {
      throw error;
    }
    throw createGalileoError(
      `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "NETWORK_ERROR"
    );
  }
}

/**
 * Create a Galileo client with verification and tracing capabilities.
 *
 * @param config - Client configuration
 * @returns GalileoClient instance
 */
export function createGalileoClient(config: GalileoConfig): GalileoClient {
  const state: GalileoClientState = {
    apiKey: config.apiKey,
    projectId: config.projectId,
    environment: config.environment ?? "production",
    baseUrl: GALILEO_API_BASE_URL,
  };

  return {
    /**
     * Verify agent output against instructions using Galileo's Instruction Adherence metric.
     */
    async verify(request: VerifyRequest): Promise<VerifyResponse> {
      try {
        const response = await apiRequest<VerifyResponse>(
          state,
          "/evaluate/instruction-adherence",
          "POST",
          {
            output: request.output,
            instructions: request.instructions,
            context: request.context,
          }
        );
        return response;
      } catch (error) {
        const galileoError = error as GalileoError;

        // Handle rate limiting with retry
        if (galileoError.code === "RATE_LIMITED") {
          await delay(DEFAULT_RETRY_DELAY_MS);
          return this.verify(request);
        }

        // Handle invalid input by returning failed verification
        if (galileoError.code === "INVALID_INPUT") {
          return {
            score: 0,
            reasoning: `Verification failed: ${galileoError.message}`,
            criteria_results: [],
            issues: [galileoError.message],
            suggestions: [],
          };
        }

        throw error;
      }
    },

    /**
     * Record a single trace event.
     */
    async trace(event: TraceEvent): Promise<void> {
      try {
        await apiRequest<void>(state, "/traces", "POST", {
          trace_id: event.trace_id,
          job_id: event.job_id,
          timestamp: event.timestamp.toISOString(),
          agent: event.agent,
          step: event.step,
          input: sanitize(event.input),
          output: sanitize(event.output),
          reasoning: event.reasoning,
          decision: event.decision,
          duration_ms: event.duration_ms,
          tokens_used: event.tokens_used,
          metadata: event.metadata,
        });
      } catch (error) {
        // Tracing failures should not block execution
        // Log the error but don't throw
        console.error("[Galileo] Trace error:", error);
      }
    },

    /**
     * Record multiple trace events in a batch.
     */
    async traceBatch(events: TraceEvent[]): Promise<void> {
      if (events.length === 0) return;

      try {
        await apiRequest<void>(state, "/traces/batch", "POST", {
          events: events.map((event) => ({
            trace_id: event.trace_id,
            job_id: event.job_id,
            timestamp: event.timestamp.toISOString(),
            agent: event.agent,
            step: event.step,
            input: sanitize(event.input),
            output: sanitize(event.output),
            reasoning: event.reasoning,
            decision: event.decision,
            duration_ms: event.duration_ms,
            tokens_used: event.tokens_used,
            metadata: event.metadata,
          })),
        });
      } catch (error) {
        // Tracing failures should not block execution
        console.error("[Galileo] Batch trace error:", error);
      }
    },

    /**
     * Get quality metrics for a job.
     */
    async getJobMetrics(job_id: string): Promise<QualityMetrics> {
      return apiRequest<QualityMetrics>(state, `/metrics/jobs/${job_id}`, "GET");
    },
  };
}

// =============================================================================
// TRACING WRAPPER
// =============================================================================

/**
 * Wrap a LangGraph node function with tracing.
 *
 * This wrapper captures input/output and timing information for observability.
 * The input type must extend TraceableInput (i.e., have a job_id property).
 *
 * @param nodeName - Name of the node (used as agent type in traces)
 * @param nodeFunction - The async function to wrap
 * @param client - Optional Galileo client (if not provided, uses global client)
 * @returns Wrapped function with same signature
 *
 * @example
 * ```typescript
 * const tracedPlanningNode = withTracing(
 *   "planning",
 *   async (input: PlanningInput) => {
 *     // ... planning logic
 *     return output;
 *   },
 *   galileoClient
 * );
 * ```
 */
export function withTracing<TInput extends TraceableInput, TOutput>(
  nodeName: string,
  nodeFunction: (input: TInput) => Promise<TOutput>,
  client?: GalileoClient
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const traceId = generateTraceId();
    const startTime = Date.now();

    // If no client is provided, execute without tracing
    if (!client) {
      return nodeFunction(input);
    }

    try {
      const output = await nodeFunction(input);

      await client.trace({
        trace_id: traceId,
        job_id: input.job_id,
        timestamp: new Date(),
        agent: nodeName as "main" | "planning" | "plan_verifier" | "prompt",
        step: "execute",
        input: sanitize(input),
        output: sanitize(output),
        duration_ms: Date.now() - startTime,
      });

      return output;
    } catch (error) {
      await client.trace({
        trace_id: traceId,
        job_id: input.job_id,
        timestamp: new Date(),
        agent: nodeName as "main" | "planning" | "plan_verifier" | "prompt",
        step: "error",
        input: sanitize(input),
        output: { error: error instanceof Error ? error.message : "Unknown error" },
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  };
}

// =============================================================================
// VERIFICATION HELPERS
// =============================================================================

/**
 * Score thresholds for verification decisions.
 */
export const VERIFICATION_THRESHOLDS = {
  /** Score >= 0.90: Proceed to payment */
  PASS: 0.90,
  /** Score 0.80-0.89: Proceed, log issues */
  PASS_WITH_NOTES: 0.80,
  /** Score 0.60-0.79: Send feedback, retry */
  RETRY: 0.60,
  /** Score < 0.60: Try different agent or fail */
  REJECT: 0.60,
} as const;

/**
 * Verification decision based on score.
 */
export type VerificationDecision = "PASS" | "PASS_WITH_NOTES" | "RETRY" | "REJECT";

/**
 * Determine the verification decision based on score.
 *
 * @param score - Verification score (0-1)
 * @returns Decision string
 */
export function getVerificationDecision(score: number): VerificationDecision {
  if (score >= VERIFICATION_THRESHOLDS.PASS) {
    return "PASS";
  }
  if (score >= VERIFICATION_THRESHOLDS.PASS_WITH_NOTES) {
    return "PASS_WITH_NOTES";
  }
  if (score >= VERIFICATION_THRESHOLDS.RETRY) {
    return "RETRY";
  }
  return "REJECT";
}

/**
 * Check if a verification result allows proceeding (PASS or PASS_WITH_NOTES).
 *
 * @param score - Verification score
 * @returns true if the result allows proceeding
 */
export function isVerificationPassing(score: number): boolean {
  const decision = getVerificationDecision(score);
  return decision === "PASS" || decision === "PASS_WITH_NOTES";
}

/**
 * Check if a verification result requires retry.
 *
 * @param score - Verification score
 * @returns true if retry is needed
 */
export function shouldRetryVerification(score: number): boolean {
  return getVerificationDecision(score) === "RETRY";
}

/**
 * Extract failed criteria from verification response for retry feedback.
 *
 * @param response - Verification response
 * @returns Array of failed criteria with details
 */
export function extractFailedCriteria(
  response: VerifyResponse
): Array<{ criterion: string; passed: boolean; detail: string }> {
  return response.criteria_results
    .filter((cr) => !cr.passed)
    .map((cr) => ({
      criterion: cr.criterion,
      passed: cr.passed,
      detail: cr.detail ?? "",
    }));
}

// =============================================================================
// FACTORY FUNCTION (CONVENIENCE)
// =============================================================================

/**
 * Create a Galileo client from environment variables.
 *
 * Uses:
 * - GALILEO_API_KEY
 * - GALILEO_PROJECT_ID
 * - GALILEO_ENVIRONMENT (optional, defaults to "production")
 *
 * @returns GalileoClient instance
 * @throws Error if required environment variables are missing
 */
export function createGalileoClientFromEnv(): GalileoClient {
  const apiKey = process.env.GALILEO_API_KEY;
  const projectId = process.env.GALILEO_PROJECT_ID;
  const environment = process.env.GALILEO_ENVIRONMENT as "development" | "production" | undefined;

  if (!apiKey) {
    throw new Error("GALILEO_API_KEY environment variable is not defined");
  }

  if (!projectId) {
    throw new Error("GALILEO_PROJECT_ID environment variable is not defined");
  }

  return createGalileoClient({
    apiKey,
    projectId,
    environment,
  });
}
