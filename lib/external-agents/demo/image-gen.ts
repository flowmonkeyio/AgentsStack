/**
 * ImageGen Demo Agent
 *
 * Async agent for high-quality image generation.
 * Uses Fireworks AI Stable Diffusion XL.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

import type {
  AgentExecuteRequest,
  AgentExecuteResponseAsync,
  AgentStatusResponse,
  AgentRegistration,
  AgentUsage,
} from '../types';

export const imageGenConfig: AgentRegistration = {
  name: 'ImageGen',
  description: 'Image generation for marketing and social media',
  url: 'https://agentstack-imagegen.vercel.app/api',
  pricing: { base_price: 0.08, negotiable: false },
  capabilities: 'hero images, social graphics, product mockups, illustrations',
  tags: ['image', 'graphics', 'visual'],
  supports_async: true,
  supports_callback: true,
  wallet: '0x0000000000000000000000000000000000000003',
};

interface TaskState {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  output?: {
    image: {
      url: string;
      width: number;
      height: number;
      format: string;
    };
    alt_text: string;
  };
  error?: string;
  usage: AgentUsage;
  callback_url?: string;
}

interface FireworksImageResponse {
  data: Array<{ url: string }>;
}

/**
 * ImageGen agent with async processing.
 * Maintains task state in-memory (use Redis in production).
 */
export class ImageGenAgent {
  private fireworksApiKey: string;
  private tasks: Map<string, TaskState> = new Map();

  constructor(fireworksApiKey: string) {
    this.fireworksApiKey = fireworksApiKey;
  }

  /**
   * Accept task and return async reference.
   */
  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponseAsync> {
    const referenceId = crypto.randomUUID();

    // Initialize task state
    this.tasks.set(referenceId, {
      status: 'processing',
      progress: 0,
      callback_url: request.callback_url,
      usage: { total_cost: 0.08 }, // Pre-allocate cost
    });

    // Start async processing (don't await)
    this.processImage(referenceId, request.prompt, request.callback_url);

    return {
      status: 'accepted',
      reference_id: referenceId,
      status_url: `/api/status/${referenceId}`,
      estimated_completion_ms: 30000,
      supports_callback: true,
    };
  }

  /**
   * Get current task status.
   */
  getStatus(referenceId: string): AgentStatusResponse | null {
    const task = this.tasks.get(referenceId);
    if (!task) return null;

    if (task.status === 'processing') {
      return {
        status: 'processing',
        progress: task.progress,
        message: 'Generating image...',
      };
    }

    if (task.status === 'completed') {
      return {
        status: 'completed',
        output: task.output,
        usage: task.usage,
      };
    }

    return {
      status: 'failed',
      error: task.error ?? 'Unknown error',
      retryable: true,
    };
  }

  /**
   * Process image generation asynchronously.
   */
  private async processImage(
    referenceId: string,
    prompt: string,
    callbackUrl?: string
  ): Promise<void> {
    try {
      // Update progress
      this.updateTask(referenceId, { progress: 0.3 });

      // Call Fireworks AI
      const response = await fetch('https://api.fireworks.ai/inference/v1/image_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.fireworksApiKey}`,
        },
        body: JSON.stringify({
          model: 'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0',
          prompt: prompt,
          width: 1024,
          height: 1024,
          steps: 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`Fireworks API error: ${response.status}`);
      }

      this.updateTask(referenceId, { progress: 0.8 });

      const data: FireworksImageResponse = await response.json();
      const imageUrl = data.data[0].url; // Fireworks returns URL

      // Complete task
      const task = this.tasks.get(referenceId);
      if (!task) return;

      const completedTask: TaskState = {
        ...task,
        status: 'completed',
        output: {
          image: {
            url: imageUrl,
            width: 1024,
            height: 1024,
            format: 'png',
          },
          alt_text: 'Generated image',
        },
        usage: { total_cost: 0.08 },
      };
      this.tasks.set(referenceId, completedTask);

      // Send callback if provided
      if (callbackUrl) {
        await this.sendCallback(callbackUrl, referenceId, completedTask);
      }
    } catch (error) {
      const task = this.tasks.get(referenceId);
      if (!task) return;

      this.tasks.set(referenceId, {
        ...task,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Send failure callback if provided
      if (callbackUrl) {
        await this.sendCallback(callbackUrl, referenceId, this.tasks.get(referenceId)!);
      }
    }
  }

  private updateTask(referenceId: string, updates: Partial<TaskState>): void {
    const task = this.tasks.get(referenceId);
    if (task) {
      this.tasks.set(referenceId, { ...task, ...updates });
    }
  }

  private async sendCallback(
    callbackUrl: string,
    referenceId: string,
    task: TaskState
  ): Promise<void> {
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_id: referenceId,
          status: task.status,
          output: task.output,
          error: task.error,
          usage: task.usage,
        }),
      });
    } catch {
      // Callback failures are logged but don't affect task status
      console.error(`Callback to ${callbackUrl} failed`);
    }
  }
}
