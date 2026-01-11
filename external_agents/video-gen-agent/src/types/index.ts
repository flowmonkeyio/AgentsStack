/**
 * Video Generation Types
 */

export interface VideoGenerationOptions {
  prompt: string;
  duration?: number; // Duration in seconds (e.g., 5, 10)
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  resolution?: '720p' | '1080p';
}

export interface VideoGenerationResult {
  video_url: string;
  duration: number;
  width: number;
  height: number;
  format: string;
  model_used: string;
  cost_usd: number;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: VideoGenerationResult;
  error?: string;
  created_at: string;
  updated_at: string;
  estimated_remaining_ms?: number;
}

/**
 * MCP Protocol Types
 */
export interface MCPRequest {
  task_id: string;
  prompt: string;
  options?: VideoGenerationOptions;
  callback_url?: string;
}

export interface MCPResponse {
  task_id: string;
  status: 'accepted' | 'rejected';
  message?: string;
  estimated_completion_ms?: number;
}

export interface MCPStatusResponse {
  task_id: string;
  status: TaskStatus['status'];
  progress?: number;
  result?: VideoGenerationResult;
  error?: string;
  estimated_remaining_ms?: number;
}
