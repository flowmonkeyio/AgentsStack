/**
 * API Client
 *
 * Typed API client for communicating with the backend.
 * Uses Clerk for authentication token management.
 * @see /docs/designs/frontend/TECH_DESIGN.md
 */

import type {
  CreateJobRequest,
  CreateJobResponse,
  GetJobResponse,
  ContinueJobResponse,
  ErrorResponse,
} from "@/types/api";

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Custom error class for API errors
 */
export class APIClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "APIClientError";
  }
}

// =============================================================================
// API CLIENT IMPLEMENTATION
// =============================================================================

/**
 * API Client for type-safe communication with the backend
 */
export class APIClient {
  private baseUrl: string;
  private getAuthToken: () => Promise<string | null>;

  /**
   * Create a new API client instance
   * @param baseUrl - Base URL for API requests (empty string for same-origin)
   * @param getAuthToken - Function to retrieve authentication token
   */
  constructor(baseUrl: string, getAuthToken: () => Promise<string | null>) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAuthToken();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorData: ErrorResponse;
      try {
        errorData = (await response.json()) as ErrorResponse;
      } catch {
        // If response is not JSON, create a generic error
        throw new APIClientError(
          `Request failed with status ${response.status}`,
          "NETWORK_ERROR",
          response.status
        );
      }
      throw new APIClientError(
        errorData.error,
        errorData.code,
        response.status,
        errorData.details
      );
    }

    return response.json() as Promise<T>;
  }

  // ===========================================================================
  // JOB OPERATIONS
  // ===========================================================================

  /**
   * Create a new job
   * @param input - Job creation parameters
   * @returns Created job response with job_id and stream_url
   */
  async createJob(input: CreateJobRequest): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>("POST", "/api/jobs", input);
  }

  /**
   * Get job details by ID
   * @param job_id - The job ID to retrieve
   * @returns Full job details including work items and reasoning log
   */
  async getJob(job_id: string): Promise<GetJobResponse> {
    return this.request<GetJobResponse>("GET", `/api/jobs/${job_id}`);
  }

  /**
   * Continue an existing job with a new prompt
   * @param job_id - The job ID to continue
   * @param prompt - The continuation prompt
   * @returns Continuation response with new version and stream_url
   */
  async continueJob(job_id: string, prompt: string): Promise<ContinueJobResponse> {
    return this.request<ContinueJobResponse>(
      "POST",
      `/api/jobs/${job_id}/continue`,
      { prompt }
    );
  }

  // ===========================================================================
  // SSE CONNECTION
  // ===========================================================================

  /**
   * Create an SSE connection for job streaming
   * Returns EventSource for the hook to manage lifecycle
   * @param job_id - The job ID to stream
   * @returns EventSource instance for SSE connection
   */
  streamJob(job_id: string): EventSource {
    return new EventSource(`${this.baseUrl}/api/jobs/${job_id}/stream`);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Type for the Clerk auth hook return value
 */
interface ClerkAuthContext {
  getToken: () => Promise<string | null>;
}

/**
 * Store for the Clerk auth context (set by ClerkProvider)
 */
let clerkAuthContext: ClerkAuthContext | null = null;

/**
 * Set the Clerk auth context for the API client
 * This should be called from a component that has access to useAuth()
 * @param context - The Clerk auth context with getToken function
 */
export function setClerkAuthContext(context: ClerkAuthContext): void {
  clerkAuthContext = context;
}

/**
 * Default singleton API client instance
 *
 * Integration with Clerk:
 * 1. In your app layout or provider, call setClerkAuthContext with useAuth()
 * 2. Example:
 *    ```tsx
 *    "use client";
 *    import { useAuth } from "@clerk/nextjs";
 *    import { setClerkAuthContext } from "@/lib/api-client";
 *
 *    export function AuthProvider({ children }) {
 *      const auth = useAuth();
 *      useEffect(() => {
 *        setClerkAuthContext({ getToken: auth.getToken });
 *      }, [auth.getToken]);
 *      return children;
 *    }
 *    ```
 */
export const api = new APIClient("", async (): Promise<string | null> => {
  // Check if we have a Clerk auth context set
  if (clerkAuthContext) {
    return clerkAuthContext.getToken();
  }

  // Return null if no auth context is available
  // This allows unauthenticated requests where permitted
  return null;
});

// =============================================================================
// HELPER HOOK FOR CLERK INTEGRATION
// =============================================================================

/**
 * Re-export the APIClientError for use in components
 */
export { type CreateJobRequest, type CreateJobResponse, type GetJobResponse, type ContinueJobResponse } from "@/types/api";
