/**
 * Mock Agent Seed Endpoint
 *
 * Creates test data for end-to-end flow testing.
 * DEV ONLY - creates agent, job, and work item.
 *
 * @example
 *   POST /api/mock-agent/seed
 *   POST /api/mock-agent/seed?mode=async
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getAgentsCollection, getJobsCollection, getWorkItemsCollection } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode') || 'sync';
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const agents = await getAgentsCollection();
    const jobs = await getJobsCollection();
    const workItems = await getWorkItemsCollection();

    // 1. Create/Update Mock Agent
    const agentId = 'mock-test-agent';
    const mockAgentUrl = mode === 'async'
      ? `${baseUrl}/api/mock-agent?mode=async`
      : `${baseUrl}/api/mock-agent`;

    await agents.updateOne(
      { agent_id: agentId },
      {
        $set: {
          agent_id: agentId,
          name: 'Mock Test Agent',
          description: 'Mock agent for e2e flow testing',
          capabilities: 'copywriting, content generation, marketing, testing',
          endpoint: mockAgentUrl,
          url: mockAgentUrl, // Some code uses url, some uses endpoint
          wallet: '0x0000000000000000000000000000000000000000',
          pricing: {
            base_price: 0.01,
            negotiable: false,
            min_price: 0.005,
          },
          status: 'active',
          stats: {
            jobs_completed: 10,
            avg_score: 0.92,
            avg_response_time_ms: 1500,
          },
          metrics: {
            totalJobs: 10,
            successfulJobs: 9,
            failedJobs: 1,
            averageScore: 0.92,
            totalEarningsUsd: 0.10,
            averageExecutionTimeMs: 1500,
          },
          supportsAsync: true,
          supports_async: true,
          supportsCallback: true,
          supports_callback: true,
          tags: ['test', 'mock', 'development'],
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // 2. Create Test Job
    const jobId = `job_${nanoid(10)}`;
    const userId = 'test-user-123';

    await jobs.insertOne({
      job_id: jobId,
      user_id: userId,
      prompt: 'Write compelling marketing copy for a new smartphone app that helps users track their daily water intake.',
      budget: 1.00,
      status: 'planning_complete',
      plan: {
        plan_id: `plan_${nanoid(10)}`,
        status: 'approved',
        summary: 'Create marketing copy for hydration tracking app',
        action_items: [
          {
            action_item_id: 1,
            item: 'Write headline and tagline',
            deliverable_id: 'headline',
            requirements: [
              'Clear and concise',
              'Highlights health benefits',
              'Memorable and catchy',
            ],
            agent_id: agentId,
            estimated_cost: 0.01,
          },
        ],
        total_estimated_cost: 0.01,
        created_at: new Date(),
      },
      token_usage: {
        operations: [],
        total_cost: 0,
      },
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    // 3. Create Test Work Item
    const workId = `work_${nanoid(10)}`;

    await workItems.insertOne({
      work_id: workId,
      job_id: jobId,
      plan_id: `plan_${nanoid(10)}`,
      action_item_id: 1,
      status: 'prompt_generated', // Ready for dispatch
      attempt: 1,
      max_attempts: 3,
      action: {
        item: 'Write headline and tagline for hydration app',
        deliverable_id: 'headline',
        requirements: [
          'Clear and concise messaging',
          'Highlight health benefits of staying hydrated',
          'Memorable and catchy phrase',
          'Appeal to health-conscious millennials',
        ],
      },
      agent: {
        agent_id: agentId,
        name: 'Mock Test Agent',
        url: mockAgentUrl,
        price: 0.01,
      },
      prompt: {
        template_id: 'marketing-copy-v1',
        generated_prompt: `You are a marketing copywriter. Create a compelling headline and tagline for a smartphone app called "HydroTrack" that helps users monitor their daily water intake.

Requirements:
- Clear and concise messaging
- Highlight health benefits of staying hydrated
- Memorable and catchy phrase
- Appeal to health-conscious millennials

Target audience: Health-conscious professionals aged 25-40

Deliverable: A headline (max 10 words) and tagline (max 20 words)`,
        context_used: {
          summary: 'Marketing copy for hydration tracking app',
          key_points: ['health benefits', 'daily tracking', 'millennials'],
        },
      },
      output: null,
      verification: null,
      payment: {
        status: 'pending',
        negotiated_price: 0.01,
        escrow_tx: null,
        release_tx: null,
      },
      external_ref: null,
      retry_context: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    return NextResponse.json({
      success: true,
      message: 'Test data created successfully',
      data: {
        agent: {
          agent_id: agentId,
          url: mockAgentUrl,
          mode,
        },
        job: {
          job_id: jobId,
          user_id: userId,
        },
        work: {
          work_id: workId,
          status: 'prompt_generated',
          ready_for: 'dispatch',
        },
      },
      next_steps: [
        `Dispatch work: POST /api/work/${workId}/dispatch`,
        `Or test directly: POST ${mockAgentUrl}/execute`,
        `Check work status: GET /api/work/${workId}`,
      ],
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed test data', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const agents = await getAgentsCollection();
    const jobs = await getJobsCollection();
    const workItems = await getWorkItemsCollection();

    // Clean up test data
    await agents.deleteMany({ agent_id: 'mock-test-agent' });
    await jobs.deleteMany({ user_id: 'test-user-123' });
    await workItems.deleteMany({ 'agent.agent_id': 'mock-test-agent' });

    return NextResponse.json({
      success: true,
      message: 'Test data cleaned up',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clean up', details: String(error) },
      { status: 500 }
    );
  }
}
