/**
 * Mock Agent API - Status Endpoint
 *
 * Returns status of async jobs for polling.
 * Simulates progress updates until completion.
 *
 * @example
 *   GET /api/mock-agent/status/abc-123
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  AgentStatusResponseProgress,
  AgentStatusResponseCompleted,
  AgentStatusResponseFailed,
  AgentUsage,
} from '@/lib/external-agents/types';
import { asyncJobs } from '../../store';

type RouteParams = {
  params: Promise<{ referenceId: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { referenceId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const shouldFail = searchParams.get('fail') === 'true';

  // Get job from shared storage
  const job = asyncJobs.get(referenceId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found', reference_id: referenceId },
      { status: 404 }
    );
  }

  const now = Date.now();
  const elapsed = now - job.startTime;
  const totalDuration = job.completionTime - job.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);

  // Check if we should simulate failure
  if (shouldFail || job.failed) {
    const response: AgentStatusResponseFailed = {
      status: 'failed',
      error: job.failMessage || 'Mock agent simulated async failure',
      retryable: true,
    };
    return NextResponse.json(response);
  }

  // Still processing
  if (now < job.completionTime) {
    const response: AgentStatusResponseProgress = {
      status: 'processing',
      progress: Math.round(progress * 100) / 100,
      message: getProgressMessage(progress),
      estimated_remaining_ms: job.completionTime - now,
    };
    return NextResponse.json(response);
  }

  // Completed
  const response: AgentStatusResponseCompleted = {
    status: 'completed',
    output: generateMockOutput(job.request),
    usage: generateMockUsage(job.request),
    processing_time_ms: totalDuration,
  };

  // Clean up completed job
  asyncJobs.delete(referenceId);

  return NextResponse.json(response);
}

/**
 * Generate progress message based on completion percentage
 */
function getProgressMessage(progress: number): string {
  if (progress < 0.2) return 'Initializing...';
  if (progress < 0.4) return 'Processing input...';
  if (progress < 0.6) return 'Generating response...';
  if (progress < 0.8) return 'Refining output...';
  return 'Finalizing...';
}

/**
 * Generate mock output
 */
function generateMockOutput(request: {
  request_id: string;
  prompt: string;
  requirements?: string[];
}): unknown {
  return {
    title: 'Mock Agent Async Response',
    description: `Async response for request ${request.request_id}`,
    content: {
      prompt_received: request.prompt.substring(0, 100) + (request.prompt.length > 100 ? '...' : ''),
      requirements_count: request.requirements?.length ?? 0,
      generated_at: new Date().toISOString(),
      mock_data: {
        headline: 'Async Generated Headline',
        body: 'This content was generated asynchronously by the mock agent.',
        cta: 'Learn More',
        confidence: 0.92,
      },
    },
  };
}

/**
 * Generate mock usage data
 */
function generateMockUsage(request: {
  prompt: string;
}): AgentUsage {
  const promptTokens = Math.ceil(request.prompt.length / 4);
  const completionTokens = 600;
  const costPer1k = 0.02;

  const totalCost = ((promptTokens + completionTokens) / 1000) * costPer1k;

  return {
    total_cost: Math.round(totalCost * 10000) / 10000,
    model_usage: [
      {
        model: 'mock-agent/async-v1',
        native_tokens_prompt: promptTokens,
        native_tokens_completion: completionTokens,
        total_cost: totalCost,
      },
    ],
  };
}
