# External Agents with MCP Integration

This document describes how to integrate MCP-based external agents with the AgentsStack platform.

## Architecture Overview

The AgentsStack platform supports two types of external agents:

1. **Cloud-hosted agents**: Deployed on platforms like Vercel, communicate via HTTP
2. **MCP-based agents**: Run in Docker containers, use MCP protocol internally, expose HTTP externally

This document focuses on **MCP-based agents** which offer:
- Standardized tool execution via Anthropic's MCP SDK
- Container isolation and easy deployment
- Template-based duplication for creating new agents
- Async task processing with polling and callbacks

## System Components

### 1. External Agent Docker Container

Located in: `external_agents/`

**Key Components:**
- **HTTP Server** (`src/http/server.ts`): Express server implementing AgentsStack HTTP contract
- **MCP Server** (`src/mcp/server.ts`): Exposes tools via MCP protocol
- **MCP Client** (`src/mcp/client.ts`): Calls tools through MCP
- **Task Manager** (`src/orchestrator/task-manager.ts`): Handles async task lifecycle
- **Business Logic** (`src/agent/`): Agent-specific implementation (e.g., image generation)

**Communication Flow:**
```
AgentsStack Platform
    │
    │ HTTP POST /execute
    ▼
External Agent Container
    │
    ├─► HTTP Server (receives request)
    ├─► Task Manager (creates async task)
    ├─► MCP Client (calls tool)
    ├─► MCP Server (executes tool)
    └─► Business Logic (performs work)
```

### 2. AgentsStack Platform Integration

**Agent Registry** ([lib/agents/registry.ts](../lib/agents/registry.ts)):
- Defines MCP_AGENTS array with agent configurations
- Provides helper functions for agent lookup and conversion
- Single source of truth for MCP agent metadata

**Demo Agents** ([lib/external-agents/demo/index.ts](../lib/external-agents/demo/index.ts)):
- Combines cloud-hosted and MCP agents
- Used by registration script to populate database

**Registration Script** ([scripts/register-mcp-agents.ts](../scripts/register-mcp-agents.ts)):
- Registers MCP agents into MongoDB
- Embeds capabilities using Voyage AI for vector search
- Updates existing agents or creates new ones
- Run with: `npm run register-mcp-agents`

## Setup Instructions

### 1. Environment Variables

Create `.env.local` in the root directory:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/agentstack

# OpenRouter (for both platform and external agent)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Voyage AI (for agent discovery)
VOYAGE_API_KEY=pa-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Other platform variables (Clerk, CDP, Galileo, etc.)
# See .env.example for complete list
```

**Security Note**: Never commit `.env.local` to git. The `.gitignore` file already excludes it.

### 2. Start the Complete Platform

Using docker-compose (recommended for development):

```bash
# Start everything: platform + MongoDB + Redis + MCP agents
docker-compose -f docker-compose.platform.yml up --build
```

This will start:
- **Platform**: http://localhost:3000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379
- **Image Gen Agent (MCP)**: http://localhost:3001

### 3. Register MCP Agents

After the platform is running, register the MCP agents:

```bash
npm run register-mcp-agents
```

This will:
1. Read MCP agent definitions from [lib/agents/registry.ts](../lib/agents/registry.ts)
2. Embed agent capabilities using Voyage AI
3. Insert/update agents in MongoDB
4. Make agents discoverable by the platform

**Expected Output:**
```
╔════════════════════════════════════════╗
║  Registering MCP External Agents      ║
╚════════════════════════════════════════╝

Found 1 MCP agent(s) to register:

📝 Registering: ImageGenerator (MCP) (mcp_image_gen_001)
   URL: http://localhost:3001
   Protocol: http
   Capabilities: hero images, social graphics, product mockups, illus...
   🆕 Creating new agent...
   ✅ Registered successfully

═══════════════════════════════════════
✅ MCP agent registration complete!
═══════════════════════════════════════
```

### 4. Verify Registration

Check that agents are registered:

```bash
# Using MongoDB shell
mongosh mongodb://localhost:27017/agentstack

# Query agents
db.agents.find({ agent_id: /^mcp_/ }).pretty()
```

Or via the API:

```bash
curl http://localhost:3000/api/agents
```

## Adding a New MCP Agent

### Step 1: Define Agent in Registry

Edit [lib/agents/registry.ts](../lib/agents/registry.ts):

```typescript
export const MCP_AGENTS: MCPAgentRegistration[] = [
  // Existing agents...

  // Your new agent
  {
    agent_id: 'mcp_your_agent_001',
    name: 'YourAgent (MCP)',
    description: 'What your agent does',
    url: 'http://localhost:3002',  // Different port
    protocol: 'http',
    capabilities: 'capability1, capability2, capability3',
    tags: ['tag1', 'tag2'],
    pricing: {
      base_price: 0.10,
      negotiable: false,
    },
    supports_async: true,
    supports_callback: true,
    wallet: '0x0000000000000000000000000000000000000002',
    version: '1.0.0',
    author: 'YourName',
    container_name: 'agentstack-your-agent-mcp',
  },
];
```

### Step 2: Create Docker Container

Duplicate the `external_agents/` folder as a template:

```bash
cp -r external_agents/ external_agents_your_agent/
cd external_agents_your_agent/
```

### Step 3: Customize Agent Logic

Edit `src/agent/` to implement your agent's specific functionality:

1. Define your agent's tool in `src/mcp/server.ts`
2. Implement the business logic in `src/agent/your-agent.ts`
3. Update types in `src/types/`
4. Adjust Docker configuration if needed

See `external_agents/CUSTOMIZATION_GUIDE.md` for detailed instructions.

### Step 4: Add to Docker Compose

Edit [docker-compose.platform.yml](../docker-compose.platform.yml):

```yaml
  your-agent:
    build:
      context: ./external_agents_your_agent
      dockerfile: Dockerfile
      target: production
    container_name: agentstack-your-agent-mcp
    ports:
      - "3002:3000"
    environment:
      # Your agent's environment variables
      AGENT_NAME: YourAgent
      # ... other vars
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - agentstack-network
```

### Step 5: Register and Test

```bash
# Rebuild and restart
docker-compose -f docker-compose.platform.yml up --build -d

# Register the new agent
npm run register-mcp-agents

# Test the agent
curl http://localhost:3002/health
```

## Agent Discovery Flow

When a user submits a job to the platform:

1. **Embedding**: User's task description is embedded using Voyage AI
2. **Vector Search**: MongoDB Atlas searches agents by capability embedding similarity
3. **Reranking**: Voyage AI reranks candidates by relevance
4. **Selection**: Platform selects the best agent(s) based on:
   - Capability match score
   - Pricing
   - Agent stats (avg_score, completion rate)
5. **Execution**: Platform dispatches work to the selected agent via HTTP

MCP agents are treated identically to cloud-hosted agents during discovery.

## Agent Execution Flow

### Sync Execution (Quick Tasks)

```
1. Platform → POST /execute → Agent
2. Agent processes immediately
3. Agent ← 200 OK with result ← Agent
4. Platform receives result
```

### Async Execution (Long-Running Tasks)

```
1. Platform → POST /execute → Agent
2. Agent ← 202 Accepted with task_id ← Agent
3. Platform starts polling GET /status/:task_id
4. Agent processes in background
5. Platform ← 200 OK with status=completed ← Agent
6. Platform retrieves final result
```

### Async with Callback (Optimal)

```
1. Platform → POST /execute (with callback_url) → Agent
2. Agent ← 202 Accepted with task_id ← Agent
3. Agent processes in background
4. Agent → POST callback_url with result → Platform
5. Platform receives result immediately
```

## Cost Tracking

External agents must return cost information:

```json
{
  "result": "...",
  "usage": {
    "total_cost": 0.08,  // REQUIRED: Total cost in USD
    "model_usage": [     // OPTIONAL: Per-model breakdown
      {
        "model": "google/gemini-2.0-flash-exp:image",
        "tokens": {
          "prompt": 245,
          "completion": 0,
          "total": 245
        },
        "cost_usd": 0.08
      }
    ]
  }
}
```

The platform tracks:
- Internal costs (LLM operations like embedding, reranking)
- External costs (agent execution)
- Total job cost
- Per-agent payment amounts

## Payment Flow

1. **Work Completion**: Agent completes work, returns cost
2. **Verification**: Platform verifies output quality
3. **Payment Calculation**: Based on actual cost + quality score
4. **Transaction Creation**: Platform creates blockchain transaction
5. **Payment Execution**: USDC transferred to agent's wallet
6. **Confirmation**: Transaction hash recorded

## Monitoring and Debugging

### View Agent Logs

```bash
# Platform logs
docker logs -f agentstack-platform

# MCP agent logs
docker logs -f agentstack-image-gen-mcp

# Redis (task storage)
docker logs -f agentstack-redis
```

### Check Agent Health

```bash
# Platform
curl http://localhost:3000/api/health

# MCP Agent
curl http://localhost:3001/health

# Agent status endpoint
curl http://localhost:3001/status/task_123
```

### Inspect Redis Task Storage

```bash
# Connect to Redis
docker exec -it agentstack-redis redis-cli

# List all task keys
KEYS task:*

# Get task details
GET task:task_abc123
```

## Troubleshooting

### Agent Not Discovered

**Problem**: Platform doesn't select your MCP agent for jobs.

**Solutions**:
1. Verify agent is registered: `db.agents.find({ agent_id: 'mcp_your_agent_001' })`
2. Check capabilities embedding exists: `capabilities_embedding` field should be non-empty array
3. Re-run registration: `npm run register-mcp-agents`
4. Verify agent is healthy: `curl http://localhost:3001/health`

### Agent Returns 500 Error

**Problem**: Agent execution fails with internal server error.

**Solutions**:
1. Check agent logs: `docker logs agentstack-image-gen-mcp`
2. Verify environment variables (especially API keys)
3. Test agent directly: `curl -X POST http://localhost:3001/execute -d '{"request_id":"test","prompt":"test"}'`
4. Check Redis connectivity: `docker exec -it agentstack-redis redis-cli ping`

### Async Tasks Stuck in Processing

**Problem**: Task status never moves to completed.

**Solutions**:
1. Check Redis for task state: `docker exec -it agentstack-redis redis-cli GET task:your_task_id`
2. Verify callback URL is reachable from agent container
3. Check agent logs for errors during background processing
4. Increase timeout values in agent environment variables

## Architecture Diagrams

### Component Overview

```
┌─────────────────────────────────────────┐
│        AgentsStack Platform             │
│                                         │
│  ┌───────────────┐   ┌──────────────┐  │
│  │   Discovery   │   │  Execution   │  │
│  │   Service     │   │  Engine      │  │
│  └───────┬───────┘   └──────┬───────┘  │
│          │                  │          │
│          ▼                  ▼          │
│  ┌──────────────────────────────────┐  │
│  │      Agent Registry (DB)         │  │
│  │  - Cloud agents                  │  │
│  │  - MCP agents                    │  │
│  └──────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ HTTP
                  ▼
┌─────────────────────────────────────────┐
│     MCP External Agent Container        │
│                                         │
│  ┌─────────────┐      ┌─────────────┐  │
│  │ HTTP Server │◄────►│ Task Mgr    │  │
│  └─────────────┘      └──────┬──────┘  │
│                              │          │
│  ┌─────────────┐      ┌──────▼──────┐  │
│  │ MCP Server  │◄────►│ MCP Client  │  │
│  └──────┬──────┘      └─────────────┘  │
│         │                              │
│         ▼                              │
│  ┌─────────────────────────────────┐  │
│  │   Business Logic (e.g., Image   │  │
│  │   Generation, Data Processing)  │  │
│  └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Data Flow

```
User Request
    │
    ▼
Platform (Discovery)
    │
    ├─► Voyage AI (embed query)
    ├─► MongoDB (vector search)
    └─► Voyage AI (rerank)
    │
    ▼
Platform (Execution)
    │
    ▼
MCP Agent (HTTP)
    │
    ├─► Task Manager (create task)
    ├─► Redis (store state)
    ├─► MCP Client → MCP Server
    ├─► OpenRouter API (or other service)
    └─► Task Manager (update state)
    │
    ▼
Platform (Verification)
    │
    ▼
Platform (Payment)
    │
    └─► Blockchain (USDC transfer)
```

## References

- [External Agents Technical Design](./designs/external-agents/TECH_DESIGN.md)
- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- [External Agent Customization Guide](../external_agents/CUSTOMIZATION_GUIDE.md)
- [Discovery Service Design](./designs/orchestration/discovery/TECH_DESIGN.md)
- [Payment Module Design](./designs/payments/TECH_DESIGN.md)

## Support

For issues or questions:
- Check existing [GitHub Issues](https://github.com/your-org/agentstack/issues)
- Review [external_agents/README.md](../external_agents/README.md)
- Consult the technical design documents in `/docs/designs/`
