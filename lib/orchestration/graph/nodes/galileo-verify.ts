/**
 * Galileo Verify Node
 *
 * Verifies work output against the original action item requirements
 * using the Galileo verification integration.
 *
 * This node:
 * 1. Takes work item output from dispatch_poll (status: received)
 * 2. Calls Galileo verifyWork() to check instruction adherence
 * 3. Updates state with verification result (score, passed/failed, feedback)
 * 4. Determines routing: pass (to payment), retry (back to prompt), reject (to main)
 *
 * Score thresholds (from TECH_DESIGN.md):
 * - pass: score >= 0.90
 * - retry: score >= 0.60 AND attempt < 3
 * - reject: score < 0.60 OR max retries exceeded
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { WorkItem, CriteriaResult } from "@/types";
import type { OrchestrationState, RetryContext } from "../types";
import type { VerificationResult } from "@/lib/orchestration/integrations/types";
import {
  VERIFICATION_THRESHOLDS,
  MAX_VERIFICATION_RETRIES,
} from "../utils";

const logger = createLogger("graph");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Dependencies for Galileo verification.
 * Optional - if not provided, simulated verification is used.
 */
export interface GalileoVerifyDependencies {
  /**
   * Verify work output using Galileo.
   * Delegates to integrations/galileo.ts verifyWork() function.
   * @param ctx - Request context for logging
   * @param work_id - Work item ID
   * @returns Verification result with score and feedback
   */
  verifyWork: (
    ctx: RequestContext,
    work_id: string
  ) => Promise<VerificationResult>;
}

/**
 * Verification state to update on work item.
 */
interface VerificationUpdate {
  score: number;
  reasoning: string;
  criteria_results: CriteriaResult[];
  issues: string[];
  suggestions: string[];
  verified_at: Date;
}

// =============================================================================
// VERIFICATION LOGIC
// =============================================================================

/**
 * Determine verification decision based on score and attempt.
 * Mirrors the logic in integrations/galileo.ts getVerificationDecision().
 *
 * @param score - Verification score (0-1)
 * @param attempt - Current attempt number (1-based)
 * @returns Decision: pass, retry, or reject
 */
function getVerificationDecision(
  score: number,
  attempt: number
): "pass" | "retry" | "reject" {
  if (score >= VERIFICATION_THRESHOLDS.pass) {
    return "pass";
  }
  if (score >= VERIFICATION_THRESHOLDS.retry && attempt < MAX_VERIFICATION_RETRIES) {
    return "retry";
  }
  return "reject";
}

/**
 * Simulate verification for testing (when dependencies not provided).
 * Returns a successful verification result with high score.
 *
 * @param workItem - Work item being verified
 * @returns Simulated verification update
 */
function simulateVerification(workItem: WorkItem): VerificationUpdate {
  return {
    score: 0.92,
    reasoning: "Simulated verification - output meets requirements",
    criteria_results: [],
    issues: [],
    suggestions: [],
    verified_at: new Date(),
  };
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Galileo Verify Node - Dependencies holder for dependency injection.
 * This allows the graph to inject the actual Galileo integration.
 */
let galileoDeps: GalileoVerifyDependencies | null = null;

/**
 * Set Galileo verification dependencies.
 * Called during graph initialization to inject the actual integration.
 *
 * @param deps - Verification dependencies
 */
export function setGalileoVerifyDependencies(
  deps: GalileoVerifyDependencies
): void {
  galileoDeps = deps;
}

/**
 * Galileo Verify Node Implementation
 *
 * Verifies work output against requirements using Galileo API.
 * Updates work item with verification result and determines routing.
 *
 * Flow:
 * 1. Find work item ready for verification (status: received)
 * 2. Call Galileo verifyWork() via dependencies
 * 3. Determine decision based on score and attempt
 * 4. Update work item with verification result
 * 5. Return routing decision (pass/retry/reject)
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with verification result
 */
async function galileoVerifyNodeImpl(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  // Get current work item that needs verification
  // After dispatch_poll, the work item should be in "received" status
  const currentWork = state.current_work_items.find(
    (w) => w.status === "received" || w.status === "verifying"
  );

  if (!currentWork) {
    logger.warn(ctx, `operation=galileo_verify job_id=${state.job_id} result=fail reason=no_work_item`);
    return {
      error: "No work item ready for verification",
      reasoning: "No work item in received or verifying status",
      decision: "reject",
    };
  }

  const workId = currentWork.work_id;
  const agentId = currentWork.agent?.agent_id ?? "unknown";
  const attempt = currentWork.attempt;

  logger.info(ctx, `operation=galileo_verify work_id=${workId} job_id=${state.job_id} agent_id=${agentId} attempt=${attempt}`);

  // Validate work has output
  if (!currentWork.output || currentWork.output.content === undefined) {
    logger.warn(ctx, `operation=galileo_verify work_id=${workId} result=fail reason=no_output`);
    return {
      error: "Work item has no output to verify",
      reasoning: "Cannot verify work without output content",
      decision: "reject",
    };
  }

  let verificationResult: VerificationUpdate;
  let decision: "pass" | "retry" | "reject";

  // Use injected dependencies if available, otherwise simulate
  if (galileoDeps) {
    try {
      const result = await galileoDeps.verifyWork(ctx, workId);

      verificationResult = {
        score: result.score,
        reasoning: result.issues.length > 0
          ? `Score: ${(result.score * 100).toFixed(1)}%. Issues: ${result.issues.join("; ")}`
          : `Score: ${(result.score * 100).toFixed(1)}%. All criteria passed.`,
        criteria_results: result.criteria_results,
        issues: result.issues,
        suggestions: result.suggestions,
        verified_at: new Date(),
      };

      // Use the decision from the verification result
      decision = result.decision;

      logger.info(ctx, `operation=galileo_verify work_id=${workId} score=${result.score.toFixed(2)} decision=${decision} passed=${result.passed}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(ctx, `operation=galileo_verify work_id=${workId} status=failed`, error instanceof Error ? error : undefined);

      // On error, treat as reject (cannot verify)
      return {
        error: `Galileo verification failed: ${errorMessage}`,
        reasoning: `Verification API error: ${errorMessage}`,
        decision: "reject",
      };
    }
  } else {
    // Simulate verification for testing
    logger.debug(ctx, `operation=galileo_verify work_id=${workId} mode=simulated`);
    verificationResult = simulateVerification(currentWork);
    decision = getVerificationDecision(verificationResult.score, attempt);
  }

  logger.info(ctx, `operation=galileo_verify work_id=${workId} score=${verificationResult.score.toFixed(2)} decision=${decision}`);

  // Build response based on decision
  if (decision === "pass") {
    // Update work item status to verified
    const updatedWorkItems = state.current_work_items.map((w) =>
      w.work_id === workId
        ? {
            ...w,
            verification: verificationResult,
            status: "verified" as const,
          }
        : w
    );

    logger.info(ctx, `operation=galileo_verify work_id=${workId} result=pass score=${verificationResult.score.toFixed(2)}`);

    return {
      current_work_items: updatedWorkItems,
      reasoning: `Verification passed with score ${(verificationResult.score * 100).toFixed(1)}%`,
      decision: "pass",
    };
  }

  if (decision === "retry") {
    // Build retry context for prompt agent
    const retryContext: RetryContext = {
      previous_attempt: attempt,
      previous_output: currentWork.output,
      verification_feedback: {
        score: verificationResult.score,
        reasoning: verificationResult.reasoning,
        issues: verificationResult.criteria_results.map((cr) => ({
          criterion: cr.criterion,
          passed: cr.passed,
          detail: cr.detail ?? (cr.passed ? "Passed" : "Failed"),
        })),
        suggestions: verificationResult.suggestions,
      },
    };

    // Update work item with retry context and increment attempt
    const retryWorkItems = state.current_work_items.map((w) =>
      w.work_id === workId
        ? {
            ...w,
            verification: verificationResult,
            retry_context: retryContext,
            status: "retry_pending" as const,
            attempt: attempt + 1,
          }
        : w
    );

    logger.info(ctx, `operation=galileo_verify work_id=${workId} result=retry score=${verificationResult.score.toFixed(2)} next_attempt=${attempt + 1} issues=${verificationResult.issues.length}`);

    return {
      current_work_items: retryWorkItems,
      reasoning: `Verification score ${(verificationResult.score * 100).toFixed(1)}% below threshold (${VERIFICATION_THRESHOLDS.pass * 100}%). Retry attempt ${attempt + 1}/${MAX_VERIFICATION_RETRIES}. Issues: ${verificationResult.issues.join(", ")}`,
      decision: "retry",
    };
  }

  // Reject case
  const updatedWorkItems = state.current_work_items.map((w) =>
    w.work_id === workId
      ? {
          ...w,
          verification: verificationResult,
          status: "rejected" as const,
        }
      : w
  );

  const rejectReason = verificationResult.score < VERIFICATION_THRESHOLDS.retry
    ? `Verification rejected: score ${(verificationResult.score * 100).toFixed(1)}% below minimum threshold (${VERIFICATION_THRESHOLDS.retry * 100}%)`
    : `Verification rejected: max retries (${MAX_VERIFICATION_RETRIES}) exceeded with score ${(verificationResult.score * 100).toFixed(1)}%`;

  logger.warn(ctx, `operation=galileo_verify work_id=${workId} result=reject score=${verificationResult.score.toFixed(2)} attempt=${attempt} reason=${verificationResult.score < VERIFICATION_THRESHOLDS.retry ? "below_threshold" : "max_retries"}`);

  return {
    current_work_items: updatedWorkItems,
    reasoning: rejectReason,
    decision: "reject",
  };
}

/**
 * Exported galileo verify node (without tracing wrapper - tracing applied in graph.ts)
 */
export const galileoVerifyNode = galileoVerifyNodeImpl;

/**
 * Re-export for direct use
 */
export { galileoVerifyNodeImpl };

/**
 * Create a galileo verify node with injected dependencies.
 *
 * @param deps - Verification dependencies
 * @returns Node function with ctx as first parameter
 */
export function createGalileoVerifyNode(
  deps: GalileoVerifyDependencies
): (ctx: RequestContext, state: OrchestrationState) => Promise<Partial<OrchestrationState>> {
  return async (ctx: RequestContext, state: OrchestrationState) => {
    // Temporarily set dependencies for this invocation
    const prevDeps = galileoDeps;
    galileoDeps = deps;
    try {
      return await galileoVerifyNodeImpl(ctx, state);
    } finally {
      galileoDeps = prevDeps;
    }
  };
}
