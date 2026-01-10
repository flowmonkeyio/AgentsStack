import { observe, createLogger, ObserveWorkflows } from "@rungalileo/observe";
import type { WorkItemVerification, VerificationMetrics } from "@/types/work-item";

let galileoLogger: ReturnType<typeof createLogger> | null = null;

export function getGalileoLogger() {
  if (!galileoLogger) {
    galileoLogger = createLogger({
      apiKey: process.env.GALILEO_API_KEY!,
      projectId: process.env.GALILEO_PROJECT_ID!,
    });
  }
  return galileoLogger;
}

export interface VerificationInput {
  prompt: string;
  output: unknown;
  expectedType: string;
  constraints?: string[];
}

export async function verifyOutput(input: VerificationInput): Promise<WorkItemVerification> {
  const { prompt, output, expectedType, constraints } = input;

  // Use Galileo observe for verification
  const result = await observe(
    {
      projectId: process.env.GALILEO_PROJECT_ID!,
      workflow: ObserveWorkflows.evaluate,
    },
    async () => {
      // Placeholder verification logic
      // In production, this would call Galileo's evaluation APIs
      const outputStr = typeof output === "string" ? output : JSON.stringify(output);

      const relevance = outputStr.length > 10 ? 0.8 : 0.3;
      const quality = outputStr.length > 50 ? 0.85 : 0.5;
      const completeness = 0.75;
      const safety = 1.0;

      const avgScore = (relevance + quality + completeness + safety) / 4;

      return {
        passed: avgScore >= 0.7,
        score: avgScore,
        metrics: { relevance, quality, completeness, safety },
      };
    }
  );

  return {
    passed: result.passed,
    score: result.score,
    feedback: result.passed
      ? "Output meets quality standards"
      : "Output needs improvement",
    metrics: result.metrics as VerificationMetrics,
    verifiedAt: new Date(),
  };
}

export async function logTrace(
  workflowName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>
): Promise<void> {
  const logger = getGalileoLogger();

  await logger.log({
    workflow: workflowName,
    input,
    output,
    timestamp: new Date().toISOString(),
  });
}
