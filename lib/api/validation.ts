/**
 * Request Validation Utilities
 *
 * Zod schemas and validation functions for API requests.
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { z } from "zod";
import type { CreateJobRequest, ContinueJobRequest, AgentCallbackRequest } from "@/types/api";

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema for POST /api/jobs
 * - prompt: 10-5000 characters
 * - budget: $0.01-$100.00
 * - context: optional key-value pairs
 */
export const createJobSchema = z.object({
  prompt: z
    .string()
    .min(10, "Prompt must be at least 10 characters")
    .max(5000, "Prompt must be at most 5000 characters"),
  budget: z
    .number()
    .min(0.01, "Budget must be at least $0.01")
    .max(100, "Budget must be at most $100.00"),
  context: z.record(z.string().optional()).optional(),
});

/**
 * Schema for POST /api/jobs/:id/continue
 * - prompt: 1-2000 characters
 */
export const continueJobSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(2000, "Prompt must be at most 2000 characters"),
});

/**
 * Schema for POST /api/webhooks/work/:workId
 * - reference_id: required string
 * - status: "completed" | "failed" | "progress"
 * - output: optional, any JSON
 * - error: optional string
 * - progress: optional 0-1
 * - message: optional string
 */
export const agentCallbackSchema = z.object({
  reference_id: z.string().min(1, "Reference ID is required"),
  status: z.enum(["completed", "failed", "progress"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
});

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

interface ValidationSuccess<T> {
  success: true;
  data: T;
}

interface ValidationFailure {
  success: false;
  errors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Helper to convert Zod errors to a simple error map
 */
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join(".");
    errors[path || "root"] = err.message;
  });
  return errors;
}

/**
 * Validate CreateJobRequest
 */
export function validateCreateJobRequest(
  data: unknown
): ValidationResult<CreateJobRequest> {
  const result = createJobSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Validate ContinueJobRequest
 */
export function validateContinueJobRequest(
  data: unknown
): ValidationResult<ContinueJobRequest> {
  const result = continueJobSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Validate AgentCallbackRequest
 */
export function validateAgentCallbackRequest(
  data: unknown
): ValidationResult<AgentCallbackRequest> {
  const result = agentCallbackSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}
