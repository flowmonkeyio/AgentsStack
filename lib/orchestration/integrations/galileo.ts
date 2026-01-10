/**
 * Galileo Integration Module
 *
 * Handles verification of work outputs using the Galileo client.
 * Manages state transitions based on verification results.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { GalileoClient } from "@/lib/galileo";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { IWorkLifecycle } from "@/lib/orchestration/work-lifecycle";
import type { WorkItem } from "@/types";
import type { VerificationResult, IntegrationEvent } from "./types";
import { IntegrationError } from "./types";

// =============================================================================
// SCORE THRESHOLDS
// =============================================================================

/**
 * Score thresholds for verification decisions.
 * Matches the values defined in the technical design.
 */
export const VERIFICATION_THRESHOLDS = {
  /** Score >= 0.90: Pass */
  PASS: 0.90,
  /** Score 0.80-0.89: Pass with notes */
  PASS_WITH_NOTES: 0.80,
  /** Score 0.60-0.79: Retry (up to 3x) */
  RETRY: 0.60,
  /** Score < 0.60: Reject */
  REJECT: 0.60,
} as const;

/**
 * Maximum number of verification retries before rejection
 */
export const MAX_VERIFICATION_RETRIES = 3;

// =============================================================================
// VERIFICATION DECISION
// =============================================================================

/**
 * Determine the verification decision based on score and attempt number.
 *
 * @param score - Verification score (0-1)
 * @param attempt - Current attempt number
 * @returns Decision: pass, retry, or reject
 */
export function getVerificationDecision(
  score: number,
  attempt: number
): "pass" | "retry" | "reject" {
  if (score >= VERIFICATION_THRESHOLDS.PASS) {
    return "pass";
  }
  if (score >= VERIFICATION_THRESHOLDS.RETRY && attempt < MAX_VERIFICATION_RETRIES) {
    return "retry";
  }
  return "reject";
}

// =============================================================================
// VERIFICATION INTEGRATION
// =============================================================================

/**
 * Dependencies required for verification integration
 */
export interface VerificationDependencies {
  /** Galileo client for verification API */
  galileo: GalileoClient;
  /** Database client for reading work items */
  db: DatabaseClient;
  /** Work lifecycle for state transitions */
  lifecycle: IWorkLifecycle;
  /** Event emitter function */
  emitEvent: (event: IntegrationEvent) => void;
}

/**
 * Verify work output using Galileo and handle state transitions.
 *
 * Flow:
 * 1. Fetch work item
 * 2. Transition to verifying
 * 3. Call Galileo verify
 * 4. Determine decision based on score
 * 5. Transition based on decision (pass/retry/reject)
 * 6. Emit appropriate event
 *
 * @param work_id - ID of the work item to verify
 * @param deps - Required dependencies
 * @returns Verification result
 * @throws IntegrationError if Galileo call fails
 */
export async function verifyWork(
  work_id: string,
  deps: VerificationDependencies
): Promise<VerificationResult> {
  const { galileo, db, lifecycle, emitEvent } = deps;

  // Fetch work item
  const work = await db.getWorkItem(work_id);
  if (!work) {
    throw new IntegrationError(
      `Work item not found: ${work_id}`,
      "galileo",
      false,
      { work_id }
    );
  }

  // Validate work has output
  if (!work.output || !work.output.content) {
    throw new IntegrationError(
      `Work item has no output: ${work_id}`,
      "galileo",
      false,
      { work_id, status: work.status }
    );
  }

  // Transition to verifying
  await lifecycle.transition(work_id, "start_verification");

  // Call Galileo for verification
  let galileoResponse;
  try {
    galileoResponse = await galileo.verify({
      output: work.output.content,
      instructions: work.action.requirements,
      context: {
        task: work.action.item,
        agent_id: work.agent?.agent_id ?? "unknown",
        attempt: work.attempt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new IntegrationError(
      `Galileo verification failed: ${message}`,
      "galileo",
      true, // Galileo errors are typically retryable
      { work_id, error: message }
    );
  }

  // Determine decision based on score
  const decision = getVerificationDecision(galileoResponse.score, work.attempt);

  // Build verification payload for transitions
  const verificationPayload = {
    score: galileoResponse.score,
    reasoning: galileoResponse.reasoning,
    criteria_results: galileoResponse.criteria_results,
    issues: galileoResponse.issues,
  };

  // Transition based on decision
  if (decision === "pass") {
    await lifecycle.transition(work_id, "verification_pass", verificationPayload);

    emitEvent({
      type: "work:verified",
      work_id,
      score: galileoResponse.score,
      passed: true,
    });
  } else if (decision === "retry") {
    const retryPayload = {
      ...verificationPayload,
      previous_output: work.output,
      suggestions: galileoResponse.suggestions,
    };
    await lifecycle.transition(work_id, "verification_retry", retryPayload);

    emitEvent({
      type: "work:retry",
      work_id,
      attempt: work.attempt + 1,
      reason: "Verification score below threshold",
      issues: galileoResponse.issues,
    });
  } else {
    // reject
    await lifecycle.transition(work_id, "verification_reject", verificationPayload);

    emitEvent({
      type: "work:failed",
      work_id,
      reason: `Rejected: score ${galileoResponse.score}`,
    });
  }

  return {
    score: galileoResponse.score,
    passed: decision === "pass",
    decision,
    criteria_results: galileoResponse.criteria_results,
    issues: galileoResponse.issues,
    suggestions: galileoResponse.suggestions,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a work item is ready for verification.
 * Must be in "received" status with valid output.
 *
 * @param work - Work item to check
 * @returns true if ready for verification
 */
export function isReadyForVerification(work: WorkItem): boolean {
  return (
    work.status === "received" &&
    work.output !== null &&
    work.output.content !== undefined
  );
}

/**
 * Format verification feedback for retry prompt.
 * Used by Prompt Agent when generating retry prompts.
 *
 * @param result - Verification result
 * @returns Formatted feedback string
 */
export function formatVerificationFeedback(result: VerificationResult): string {
  const lines: string[] = [
    `Verification Score: ${(result.score * 100).toFixed(1)}%`,
    "",
    "Issues Found:",
  ];

  if (result.issues.length > 0) {
    result.issues.forEach((issue, i) => {
      lines.push(`${i + 1}. ${issue}`);
    });
  } else {
    lines.push("  (No specific issues listed)");
  }

  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("Suggestions for Improvement:");
    result.suggestions.forEach((suggestion, i) => {
      lines.push(`${i + 1}. ${suggestion}`);
    });
  }

  return lines.join("\n");
}
