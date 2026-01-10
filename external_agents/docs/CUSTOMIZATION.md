# Customization Guide

This guide shows you how to customize the MCP external agent template to create new types of agents.

## Overview

The template is designed with clear separation between:

- **Boilerplate** (reusable across all agents)
- **Agent-specific** (customize for your use case)

## What to Customize

### 1. Agent Configuration (`src/agent/config.ts`)

Update agent metadata:

```typescript
export const AGENT_CONFIG = {
  name: 'YourAgentName',                    // Agent display name
  version: '1.0.0',                        // Version
  description: 'What your agent does',     // Description
  capabilities: 'capability1, capability2', // Capabilities
  base_price: 0.05,                        // Price in USDC
  wallet_address: '0x...',                 // Payment address
};
```

### 2. MCP Tool (`src/mcp/tools/`)

**Create new tool file** (e.g., `src/mcp/tools/your-tool.ts`):

```typescript
import type { MCPTool } from '../types.js';

export interface YourToolInput {
  // Define input schema
  input_field: string;
}

export interface YourToolOutput {
  // Define output schema
  success: boolean;
  result?: string;
  error?: string;
}

export function createYourTool(
  yourService: YourServiceType
): MCPTool<YourToolInput, YourToolOutput> {
  return {
    definition: {
      name: 'your_tool_name',
      description: 'What your tool does',
      inputSchema: {
        type: 'object',
        properties: {
          input_field: {
            type: 'string',
            description: 'Description of input',
          },
        },
        required: ['input_field'],
      },
    },

    handler: async (input: YourToolInput): Promise<YourToolOutput> => {
      try {
        // Implement your logic here
        const result = await yourService.doSomething(input.input_field);

        return {
          success: true,
          result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}
```

**Update tool registry** (`src/mcp/tools/index.ts`):

```typescript
export { createYourTool } from './your-tool.js';
```

### 3. Business Logic (`src/agent/`)

**Replace image generator** with your agent logic:

```typescript
// src/agent/your-service.ts
export class YourService {
  async doSomething(input: string): Promise<string> {
    // Implement your agent's core functionality
    // Can call external APIs, LLMs, databases, etc.

    return 'result';
  }
}
```

### 4. Output Format (`src/types/agentstack.ts`)

Update output interface to match your agent's output:

```typescript
export interface YourAgentOutput {
  // Define your output structure
  // This is what AgentsStack will receive
  result: string;
  metadata?: Record<string, unknown>;
}
```

### 5. Task Manager Integration

Update task manager to use your new service (`src/orchestrator/task-manager.ts`):

```typescript
import { YourService } from '../agent/your-service.js';

export class TaskManager {
  private yourService: YourService;

  constructor(store: ITaskStore) {
    this.store = store;
    this.yourService = new YourService();
    // ...
  }

  private async processTask(taskId: string): Promise<void> {
    // ...

    // Call your service instead of image generator
    const result = await this.yourService.doSomething(task.prompt);

    // Format output
    const output = {
      result: result,
      // ... your output structure
    };

    // ...
  }
}
```

## Complete Example: Code Review Agent

Let's walk through creating a code review agent.

### Step 1: Update Configuration

```typescript
// src/agent/config.ts
export const AGENT_CONFIG = {
  name: 'CodeReviewer',
  version: '1.0.0',
  description: 'AI-powered code review agent',
  capabilities: 'code review, security analysis, best practices, bug detection',
  base_price: 0.05,
  wallet_address: '0x...',
};
```

### Step 2: Create Code Review Tool

```typescript
// src/mcp/tools/review-code.ts
import type { MCPTool } from '../types.js';

export interface ReviewCodeInput {
  code: string;
  language: string;
  focus?: 'security' | 'quality' | 'all';
}

export interface ReviewCodeOutput {
  success: boolean;
  review?: {
    overall_score: number;
    issues: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      line?: number;
      message: string;
      suggestion?: string;
    }>;
    summary: string;
  };
  error?: string;
  cost_usd?: number;
}

export function createReviewCodeTool(
  codeReviewer: CodeReviewer
): MCPTool<ReviewCodeInput, ReviewCodeOutput> {
  return {
    definition: {
      name: 'review_code',
      description: 'Review code for quality, security, and best practices',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to review' },
          language: { type: 'string', description: 'Programming language' },
          focus: {
            type: 'string',
            enum: ['security', 'quality', 'all'],
            description: 'Review focus area',
          },
        },
        required: ['code', 'language'],
      },
    },

    handler: async (input: ReviewCodeInput): Promise<ReviewCodeOutput> => {
      try {
        const review = await codeReviewer.review(
          input.code,
          input.language,
          input.focus ?? 'all'
        );

        return {
          success: true,
          review,
          cost_usd: 0.05,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Review failed',
        };
      }
    },
  };
}
```

### Step 3: Implement Code Reviewer

```typescript
// src/agent/code-reviewer.ts
import { OpenRouterClient } from '../lib/openrouter.js';

export class CodeReviewer {
  private llm: OpenRouterClient;

  constructor() {
    this.llm = new OpenRouterClient({
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultModel: 'anthropic/claude-sonnet-4',
    });
  }

  async review(
    code: string,
    language: string,
    focus: 'security' | 'quality' | 'all'
  ): Promise<{
    overall_score: number;
    issues: Array<{ severity: string; line?: number; message: string }>;
    summary: string;
  }> {
    // Build review prompt
    const prompt = this.buildPrompt(code, language, focus);

    // Call LLM for analysis
    const response = await this.llm.analyze(prompt);

    // Parse and structure response
    return this.parseReviewResults(response);
  }

  private buildPrompt(code: string, language: string, focus: string): string {
    return `Review this ${language} code for ${focus}:\n\n${code}`;
  }

  private parseReviewResults(response: string): any {
    // Parse LLM response into structured format
    // ...
  }
}
```

### Step 4: Update Output Type

```typescript
// src/types/agentstack.ts
export interface CodeReviewOutput {
  review: {
    overall_score: number;
    issues: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      line?: number;
      message: string;
      suggestion?: string;
    }>;
    summary: string;
    reviewed_language: string;
  };
  cost_breakdown?: ModelUsage[];
}
```

### Step 5: Update Task Manager

```typescript
// src/orchestrator/task-manager.ts (relevant changes)
import { CodeReviewer } from '../agent/code-reviewer.js';

export class TaskManager {
  private codeReviewer: CodeReviewer;

  constructor(store: ITaskStore) {
    // ...
    this.codeReviewer = new CodeReviewer();
  }

  private async processTask(taskId: string): Promise<void> {
    // ...

    // Parse code and language from prompt or requirements
    const { code, language } = this.parseCodeInput(task.prompt, task.requirements);

    // Perform review
    const review = await this.codeReviewer.review(code, language, 'all');

    // Format output
    const output: CodeReviewOutput = {
      review: {
        ...review,
        reviewed_language: language,
      },
    };

    // ... update task with output
  }
}
```

### Step 6: Update Environment

```bash
# .env
AGENT_NAME=CodeReviewer
AGENT_VERSION=1.0.0
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4
DEFAULT_TASK_COST=0.05
```

### Step 7: Rebuild and Test

```bash
docker-compose up --build
```

## What NOT to Change

These components are boilerplate and should remain as-is:

### HTTP Layer (`src/http/`)
- ✅ Keep: Express server, routes, middleware
- ✅ Keep: Request/response schemas (AgentsStack contract)
- ❌ Don't change: HTTP endpoints (`/execute`, `/status`, `/health`)

### Task Orchestration (`src/orchestrator/`)
- ✅ Keep: TaskManager state machine
- ✅ Keep: Task store (Redis/memory)
- ✅ Keep: Callback service
- ✅ Modify: `processTask()` method to call your service

### MCP Infrastructure (`src/mcp/server.ts`, `src/mcp/client.ts`)
- ✅ Keep: MCP server/client boilerplate
- ❌ Don't change: Request handlers
- ✅ Add: New tools in `src/mcp/tools/`

### Docker Configuration
- ✅ Keep: Dockerfile (unless you need additional dependencies)
- ✅ Keep: docker-compose.yml structure
- ✅ Update: Environment variables for your agent

## Tips & Best Practices

### 1. Keep HTTP Contract Compatible

Always return responses matching AgentsStack's expected format:

```typescript
// Async response
{
  status: 'accepted',
  reference_id: string,
  status_url: string,
  estimated_completion_ms: number,
  supports_callback: boolean
}

// Completed status
{
  status: 'completed',
  output: YourOutputType,
  usage: AgentUsage,
  processing_time_ms: number
}
```

### 2. Track Costs Properly

Always include usage tracking:

```typescript
const usage: AgentUsage = {
  total_cost: 0.05,  // REQUIRED
  model_usage: [     // OPTIONAL but recommended
    {
      model: 'anthropic/claude-sonnet-4',
      total_cost: 0.05,
    },
  ],
};
```

### 3. Handle Errors Gracefully

```typescript
try {
  const result = await yourService.doWork();
  return { success: true, result };
} catch (error) {
  logger.error({ error }, 'Service failed');
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}
```

### 4. Use Structured Logging

```typescript
logger.info({ taskId, duration, cost }, 'Task completed');
logger.error({ taskId, error: error.message }, 'Task failed');
```

### 5. Test Incrementally

Test each component:

1. Tool works: Test MCP tool handler directly
2. Service works: Test business logic independently
3. Task manager works: Test full async flow
4. HTTP works: Test via curl/Postman
5. Integration works: Test with AgentsStack platform

## Need Help?

- Review the image generation implementation as reference
- Check logs: `docker-compose logs -f image-gen-agent`
- Test endpoints with curl
- Validate responses match AgentsStack contract

## Summary Checklist

When creating a new agent:

- [ ] Update `AGENT_CONFIG` in `src/agent/config.ts`
- [ ] Create new tool in `src/mcp/tools/your-tool.ts`
- [ ] Export tool in `src/mcp/tools/index.ts`
- [ ] Implement service in `src/agent/your-service.ts`
- [ ] Define output type in `src/types/agentstack.ts`
- [ ] Update task manager in `src/orchestrator/task-manager.ts`
- [ ] Update `.env.example` with new variables
- [ ] Test with `docker-compose up --build`
- [ ] Update README.md with agent-specific details

That's it! You now have a fully customized external agent ready for AgentsStack integration.
