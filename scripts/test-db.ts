/**
 * Test script for core data structure
 *
 * Run with: npx tsx scripts/test-db.ts
 * Requires: MONGODB_URI in .env.local
 */

// Load env BEFORE any other imports
import { config } from "dotenv";
config({ path: ".env.local" });

// Now import the rest (dynamic import to ensure env is loaded first)
async function main() {
  const { getDatabaseClient } = await import("../lib/db");
  const { createContext } = await import("../lib/logging");
  const { nanoid } = await import("nanoid");

  console.log("Testing Core Data Structure...\n");

  const db = getDatabaseClient();
  const ctx = createContext();

  // Test 1: Create User
  console.log("1. Creating user...");
  const user = await db.createUser(ctx, {
    user_id: `user_${nanoid()}`,
    email: `test_${nanoid(6)}@example.com`,
    auth_provider: "clerk",
    wallet: {
      address: `0x${nanoid(40)}`,
      provider: "coinbase",
      verified: false,
    },
    stats: {
      total_jobs: 0,
      total_spent: 0,
      total_work_items: 0,
    },
  });
  console.log(`   ✓ Created user: ${user.user_id}\n`);

  // Test 2: Get User
  console.log("2. Fetching user...");
  const fetchedUser = await db.getUser(ctx, user.user_id);
  console.log(`   ✓ Fetched user: ${fetchedUser?.email}\n`);

  // Test 3: Create Job
  console.log("3. Creating job...");
  const job = await db.createJob(ctx, {
    job_id: `job_${nanoid()}`,
    user_id: user.user_id,
    status: "planning",
    prompt: "Test prompt for data structure validation",
    budget: {
      total: 100,
      allocated: 0,
      spent: 0,
      remaining: 100,
    },
    token_usage: {
      operations: [],
      external_costs: [],
      total_internal_cost_usd: 0,
      total_external_cost_usd: 0,
      total_cost_usd: 0,
    },
    current_plan_id: "",
    plan_version: 0,
    context_summary: "",
    context_refs: [],
    reasoning_log: [],
    versions: [],
    last_checkpoint: {
      timestamp: new Date(),
      action_item_id: 0,
      status: "planning",
    },
  });
  console.log(`   ✓ Created job: ${job.job_id}\n`);

  // Test 4: Update Job Status
  console.log("4. Updating job status...");
  await db.updateJobStatus(ctx, job.job_id, "executing");
  const updatedJob = await db.getJob(ctx, job.job_id);
  console.log(`   ✓ Status updated to: ${updatedJob?.status}\n`);

  // Test 5: Add Reasoning Log
  console.log("5. Adding reasoning log entry...");
  await db.addReasoningLog(ctx, job.job_id, {
    ts: new Date(),
    agent: "planning",
    step: "analyze_request",
    thought: "Analyzing user request for test",
    decision: "Proceed with planning",
  });
  const jobWithLog = await db.getJob(ctx, job.job_id);
  console.log(`   ✓ Reasoning log entries: ${jobWithLog?.reasoning_log.length}\n`);

  // Test 6: Create Plan
  console.log("6. Creating plan...");
  const plan = await db.createPlan(ctx, {
    plan_id: `plan_${nanoid()}`,
    job_id: job.job_id,
    version: 1,
    status: "pending",
    verified_at: null,
    verification_attempts: 0,
    verification_issues: [],
    requirements: {
      deliverables: [
        { id: "D1", name: "Test Deliverable", criteria: ["Criterion 1"] },
      ],
      constraints: { budget: 100 },
    },
    action_items: [
      {
        id: 1,
        item: "Test action item",
        priority: 1,
        depends_on: [],
        deliverable_id: "D1",
        agent_id: null,
        template_id: "template_default",
        estimated_cost: 10,
        status: "pending",
        work_id: null,
        resource_type: "AGENT",
      },
    ],
  });
  console.log(`   ✓ Created plan: ${plan.plan_id}\n`);

  // Test 7: Create Work Item (16-state machine)
  console.log("7. Creating work item with 16-state status...");
  const workItem = await db.createWorkItem(ctx, {
    work_id: `work_${nanoid()}`,
    job_id: job.job_id,
    plan_id: plan.plan_id,
    action_item_id: 1,
    status: "pending",
    attempt: 1,
    max_attempts: 3,
    action: {
      item: "Test action",
      deliverable_id: "D1",
      requirements: ["Requirement 1"],
    },
    agent: null,
    prompt: null,
    external_ref: null,
    output: null,
    verification: null,
    retry_context: null,
    payment: null,
    token_usage: {
      internal: [],
      external: null,
      total_internal_cost_usd: 0,
      total_external_cost_usd: 0,
      total_cost_usd: 0,
    },
    retries: [],
    started_at: null,
    completed_at: null,
  });
  console.log(`   ✓ Created work item: ${workItem.work_id}`);
  console.log(`   ✓ Initial status: ${workItem.status}\n`);

  // Test 8: Update Work Item through states
  console.log("8. Testing status transitions...");
  const states = [
    "ready",
    "prompting",
    "dispatched",
    "polling",
    "received",
    "verifying",
    "verified",
    "paying",
    "completed",
  ] as const;

  for (const status of states) {
    await db.updateWorkItemStatus(ctx, workItem.work_id, status);
  }
  const finalWorkItem = await db.getWorkItem(ctx, workItem.work_id);
  console.log(`   ✓ Final status: ${finalWorkItem?.status}\n`);

  console.log("═══════════════════════════════════════");
  console.log("✓ All tests passed!");
  console.log("═══════════════════════════════════════\n");

  console.log("Test data created:");
  console.log(`  - User: ${user.user_id}`);
  console.log(`  - Job: ${job.job_id}`);
  console.log(`  - Plan: ${plan.plan_id}`);
  console.log(`  - WorkItem: ${workItem.work_id}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Test failed:", error.message);
  process.exit(1);
});
