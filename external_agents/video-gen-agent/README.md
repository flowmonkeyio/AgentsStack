# Video Generation Agent (Sora 2)

MCP-based video generation agent using OpenAI Sora 2.

## Features

- **Async Task Processing**: Accepts video generation requests and processes them asynchronously
- **MCP Protocol**: Implements the Model Context Protocol for AgentsStack integration
- **Redis Storage**: Optional Redis backend for task persistence
- **Callback Support**: Sends results to callback URLs when tasks complete
- **Health Monitoring**: Built-in health check endpoint

## API Endpoints

### POST /execute
Start a new video generation task.

**Request:**
```json
{
  "task_id": "optional-custom-id",
  "prompt": "A serene sunset over a calm ocean",
  "options": {
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  },
  "callback_url": "https://platform.example.com/webhook"
}
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted",
  "estimated_completion_ms": 150000
}
```

### GET /status/:task_id
Get the status of a video generation task.

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "progress": 100,
  "result": {
    "video_url": "https://storage.example.com/video.mp4",
    "duration": 5,
    "width": 1920,
    "height": 1080,
    "format": "mp4",
    "model_used": "sora-2",
    "cost_usd": 0.25
  },
  "estimated_remaining_ms": 0
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "agent": {
    "name": "VideoGenerator",
    "version": "1.0.0",
    "capabilities": "short videos, promotional content, social media clips, product demos",
    "base_price": 0.50
  }
}
```

## Environment Variables

### Required
- `OPENAI_API_KEY` - OpenAI API key with Sora access

### Optional
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)
- `OPENAI_VIDEO_MODEL` - Sora model version (default: sora-2, options: sora-2, sora-2-pro)
- `MAX_VIDEO_DURATION` - Maximum video length in seconds (default: 12, allowed values: 4, 8, or 12)
- `TASK_STORE_TYPE` - Task storage type: memory or redis (default: memory)
- `REDIS_URL` - Redis connection URL
- `VIDEO_GENERATION_TIMEOUT` - Timeout in ms (default: 600000)

## Running Locally

```bash
# Install dependencies
npm install

# Set environment variables
export OPENAI_API_KEY=your-api-key

# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Docker

```bash
# Build
docker build -t video-gen-agent .

# Run
docker run -p 3002:3000 \
  -e OPENAI_API_KEY=your-api-key \
  video-gen-agent
```

## Integration with AgentsStack

The agent runs on port 3002 and can be accessed by the AgentsStack platform at:
- `http://localhost:3002/execute` - Submit video generation tasks
- `http://localhost:3002/status/:task_id` - Check task status
- `http://localhost:3002/health` - Health check

## Note on Sora API Availability

**Important**: As of January 2025, OpenAI's Sora 2 API may have limited availability. This agent includes an implementation that follows the Sora 2 API specification:

- **API Endpoints**: POST /videos (create job), GET /videos/{video_id} (poll status)
- **Models**: sora-2 (standard), sora-2-pro (higher quality)
- **Duration**: Videos can be 4, 8, or 12 seconds long
- **Polling**: The client automatically polls for completion with 5-second intervals

If the API is not yet available in your account, the client will throw an informative error. For testing purposes, you can modify the `OpenAISoraClient.createVideoJob()` method in `src/lib/openai-sora2.ts` to return mock data.

## Cost Estimation

Default pricing (will be adjusted when Sora pricing is announced):
- Base cost: $0.50 per video
- Cost per second: $0.05/second
- Example: 5-second video = $0.25

## License

MIT
