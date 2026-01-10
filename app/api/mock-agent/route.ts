/**
 * Mock Agent API - Info Endpoint
 *
 * Returns documentation and capabilities of the mock agent.
 * Use this endpoint to discover available test configurations.
 *
 * @example
 *   GET /api/mock-agent
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Mock Test Agent',
    version: '1.0.0',
    description: 'Mock agent for testing the end-to-end agent connection flow',

    endpoints: {
      execute: {
        method: 'POST',
        path: '/api/mock-agent/execute',
        description: 'Submit work to the mock agent',
        query_params: {
          mode: {
            type: 'string',
            values: ['sync', 'async'],
            default: 'sync',
            description: 'Response mode - sync returns immediately, async requires polling',
          },
          delay: {
            type: 'number',
            default: 100,
            description: 'Milliseconds to wait before responding (sync mode)',
          },
          async_delay: {
            type: 'number',
            default: 3000,
            description: 'Milliseconds until async job completes',
          },
          fail: {
            type: 'boolean',
            default: false,
            description: 'Force the request to fail',
          },
          fail_rate: {
            type: 'number',
            range: '0-1',
            default: 0,
            description: 'Random failure probability (0.3 = 30% chance)',
          },
        },
        request_body: {
          request_id: { type: 'string', required: true },
          prompt: { type: 'string', required: true },
          requirements: { type: 'string[]', required: false },
          callback_url: { type: 'string', required: false },
          adjustment: {
            type: 'object',
            required: false,
            description: 'Retry context for adjustment attempts',
          },
        },
      },
      status: {
        method: 'GET',
        path: '/api/mock-agent/status/{referenceId}',
        description: 'Poll for async job status',
        query_params: {
          fail: {
            type: 'boolean',
            default: false,
            description: 'Force status to return failed',
          },
        },
      },
    },

    examples: {
      sync_simple: {
        description: 'Basic sync request',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute?mode=sync' \\
  -H 'Content-Type: application/json' \\
  -d '{"request_id": "test-123", "prompt": "Write a headline for a shoe sale"}'`,
      },
      sync_with_delay: {
        description: 'Sync with simulated processing time',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute?mode=sync&delay=2000' \\
  -H 'Content-Type: application/json' \\
  -d '{"request_id": "test-123", "prompt": "Generate marketing copy"}'`,
      },
      async_with_polling: {
        description: 'Async mode requiring status polling',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute?mode=async&async_delay=5000' \\
  -H 'Content-Type: application/json' \\
  -d '{"request_id": "test-123", "prompt": "Generate complex analysis"}'`,
      },
      async_with_callback: {
        description: 'Async with webhook callback',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute?mode=async' \\
  -H 'Content-Type: application/json' \\
  -d '{"request_id": "test-123", "prompt": "Process data", "callback_url": "http://localhost:3000/api/webhooks/test"}'`,
      },
      failure_testing: {
        description: 'Force failure for error handling testing',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute?fail=true' \\
  -H 'Content-Type: application/json' \\
  -d '{"request_id": "test-123", "prompt": "This will fail"}'`,
      },
      retry_context: {
        description: 'Send with retry/adjustment context',
        curl: `curl -X POST 'http://localhost:3000/api/mock-agent/execute' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "request_id": "test-123-retry-1",
    "prompt": "Write improved headline",
    "adjustment": {
      "is_retry": true,
      "attempt": 2,
      "previous_output": {"headline": "Bad headline"},
      "issues": [{"criterion": "clarity", "detail": "Too vague"}],
      "feedback": "Make it more specific"
    }
  }'`,
      },
    },

    registration: {
      description: 'Use this to register the mock agent via POST /api/agents',
      curl: `curl -X POST 'http://localhost:3000/api/agents' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -d '{
    "name": "Mock Test Agent",
    "description": "A mock agent for testing the end-to-end flow",
    "capabilities": "Testing, mock responses, sync and async execution, configurable delays and failures",
    "endpoint": "http://localhost:3000/api/mock-agent/execute",
    "pricing": {
      "basePrice": 0.01,
      "currency": "USDC",
      "negotiable": false
    },
    "wallet": "0x0000000000000000000000000000000000000000"
  }'`,
      payload: {
        name: 'Mock Test Agent',
        description: 'A mock agent for testing the end-to-end flow',
        capabilities: 'Testing, mock responses, sync and async execution, configurable delays and failures',
        endpoint: 'http://localhost:3000/api/mock-agent/execute',
        pricing: {
          basePrice: 0.01,
          currency: 'USDC',
          negotiable: false,
        },
        wallet: '0x0000000000000000000000000000000000000000',
      },
    },
  });
}
