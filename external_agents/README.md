# AgentsStack MCP External Agent Template

**MCP-based external agent for image generation using OpenRouter.**

This is a fully-functional, production-ready external agent that demonstrates integration with the AgentsStack platform using the Model Context Protocol (MCP). It can be used as-is for image generation or as a template for building other types of external agents.

## Features

- ✅ **HTTP REST API** - Compatible with AgentsStack's external agent contract
- ✅ **MCP Integration** - Uses Model Context Protocol for standardized tool execution
- ✅ **Async Execution** - Tasks run asynchronously with polling and callback support
- ✅ **Image Generation** - Powered by OpenRouter (Gemini Image, FLUX, etc.)
- ✅ **Cost Tracking** - Automatic usage and cost reporting
- ✅ **Docker Ready** - Multi-stage Dockerfile + docker-compose
- ✅ **Template Design** - Easy to customize for other agent types
- ✅ **Production-Ready** - Redis storage, health checks, graceful shutdown

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose** installed
- **OpenRouter API Key** ([Get one here](https://openrouter.ai/keys))

### 1. Clone and Setup

```bash
cd external_agents
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` and add your OpenRouter API key:

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Start with Docker Compose

```bash
docker-compose up --build
```

The agent will start on **http://localhost:3001**

### 4. Test the Agent

**Health Check:**
```bash
curl http://localhost:3001/health
```

**Generate an Image:**
```bash
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test_001",
    "prompt": "A futuristic AI workspace with holographic displays and neon lights"
  }'
```

Response:
```json
{
  "status": "accepted",
  "reference_id": "task_abc123",
  "status_url": "/status/task_abc123",
  "estimated_completion_ms": 30000,
  "supports_callback": true
}
```

**Check Status:**
```bash
curl http://localhost:3001/status/task_abc123
```

Response (when completed):
```json
{
  "status": "completed",
  "output": {
    "image": {
      "url": "https://...",
      "width": 1024,
      "height": 1024,
      "format": "png"
    },
    "alt_text": "A futuristic AI workspace...",
    "model_used": "google/gemini-2.0-flash-exp:image"
  },
  "usage": {
    "total_cost": 0.08,
    "model_usage": [...]
  },
  "processing_time_ms": 24500
}
```

## Architecture

### Hybrid Protocol Design

The agent uses a **hybrid architecture**:

- **External Interface**: HTTP REST API (compatible with AgentsStack)
- **Internal Architecture**: MCP server/client (for standardization)

```
AgentsStack Platform → HTTP REST → Express Server → Task Orchestrator
                                                          ↓
                                                     MCP Client
                                                          ↓
                                                     MCP Server (stdio)
                                                          ↓
                                                   generate_image tool
                                                          ↓
                                                   OpenRouter API
```

### Key Components

1. **HTTP API Layer** (`src/http/`) - Express server implementing AgentsStack contract
2. **Task Orchestrator** (`src/orchestrator/`) - Async task management with Redis
3. **MCP Layer** (`src/mcp/`) - MCP server/client for tool execution
4. **Business Logic** (`src/agent/`) - Image generation using OpenRouter
5. **Shared Libraries** (`src/lib/`) - Logger, OpenRouter client, utilities

## API Reference

### POST /execute

Execute a task (image generation).

**Request:**
```json
{
  "request_id": "string",
  "prompt": "string",
  "requirements": ["string"],  // Optional
  "callback_url": "string"     // Optional
}
```

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "reference_id": "string",
  "status_url": "string",
  "estimated_completion_ms": 30000,
  "supports_callback": true
}
```

### GET /status/:id

Check task status.

**Response (Processing):**
```json
{
  "status": "processing",
  "progress": 0.5,
  "message": "Generating image..."
}
```

**Response (Completed):**
```json
{
  "status": "completed",
  "output": { ... },
  "usage": { ... },
  "processing_time_ms": 24500
}
```

**Response (Failed):**
```json
{
  "status": "failed",
  "error": "Error message",
  "retryable": true
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T...",
  "agent": {
    "name": "ImageGenerator",
    "version": "1.0.0"
  }
}
```

## Configuration

All configuration is done via environment variables (see `.env.example`).

### Required

- `OPENROUTER_API_KEY` - Your OpenRouter API key

### Optional

- `OPENROUTER_DEFAULT_MODEL` - Model to use (default: `google/gemini-2.0-flash-exp:image`)
- `TASK_STORE_TYPE` - `redis` or `memory` (default: `redis`)
- `PORT` - HTTP port (default: `3000`)
- `LOG_LEVEL` - `debug`, `info`, `warn`, `error` (default: `info`)

See `.env.example` for complete list.

## Deployment

### Standalone Docker Container

```bash
# Build
docker build -t agentstack/image-gen-mcp:latest .

# Run
docker run -d \
  --name agentstack-image-gen \
  -p 3001:3000 \
  -e OPENROUTER_API_KEY=${OPENROUTER_API_KEY} \
  -e TASK_STORE_TYPE=memory \
  agentstack/image-gen-mcp:latest
```

### Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Production

For production deployment:

1. Set `NODE_ENV=production`
2. Use Redis for task storage (`TASK_STORE_TYPE=redis`)
3. Configure proper logging (`LOG_LEVEL=info`, `LOG_FORMAT=json`)
4. Set up monitoring (health check endpoint)
5. Use environment-specific secrets management

## Customizing for Other Agent Types

This template can be easily adapted for different agent types. See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for a complete guide.

**Quick Example - Code Review Agent:**

1. Copy template:
   ```bash
   cp -r external_agents external_agents_code_review
   ```

2. Update configuration (`src/agent/config.ts`):
   ```typescript
   export const AGENT_CONFIG = {
     name: 'CodeReviewer',
     capabilities: 'code review, security analysis',
     base_price: 0.05,
   };
   ```

3. Replace MCP tool (`src/mcp/tools/review-code.ts`):
   ```typescript
   export const reviewCodeTool = {
     definition: {
       name: 'review_code',
       inputSchema: { /* code, language */ }
     },
     handler: async (input) => {
       // Implement code review logic
     }
   };
   ```

4. Update business logic (`src/agent/code-reviewer.ts`)

5. Rebuild and deploy

## Development

### Local Development (Without Docker)

```bash
# Install dependencies
npm install

# Copy environment
cp .env.example .env

# Edit .env and add OPENROUTER_API_KEY

# Run in development mode
npm run dev
```

### Build TypeScript

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

## Integration with AgentsStack

**Note**: Integration changes to AgentsStack platform are out of scope for this container, but here's how to integrate:

### 1. Register Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ImageGenerator MCP",
    "url": "http://localhost:3001",
    "capabilities": "hero images, social graphics, product mockups",
    "pricing": { "base_price": 0.08, "negotiable": false },
    "supports_async": true,
    "supports_callback": true,
    "wallet": "0x..."
  }'
```

### 2. Platform Integration Points

The following AgentsStack files would need updates (tracked but not implemented):

- `lib/agents/registry.ts` - Add MCP agent to registry
- `docker-compose.platform.yml` - Orchestrate platform + agents
- `lib/orchestration/discovery/service.ts` - Support MCP protocol
- Documentation for running external agents with platform

## Troubleshooting

### Agent won't start

- Check `OPENROUTER_API_KEY` is set correctly
- Ensure port 3001 is not already in use
- Check logs: `docker-compose logs -f image-gen-agent`

### Redis connection issues

- Ensure Redis container is running: `docker-compose ps`
- Check Redis health: `docker-compose exec redis redis-cli ping`
- For development, use `TASK_STORE_TYPE=memory`

### Image generation fails

- Verify OpenRouter API key is valid
- Check OpenRouter account has credits
- Review logs for specific error messages
- Try fallback model: `OPENROUTER_FALLBACK_MODEL=flux/flux-1.1-pro`

## License

MIT

## Contributing

This is a template project. Feel free to fork and customize for your needs!

## Links

- [AgentsStack Documentation](../../docs/project_structure.md)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Architecture Details](docs/ARCHITECTURE.md)
- [Customization Guide](docs/CUSTOMIZATION.md)
