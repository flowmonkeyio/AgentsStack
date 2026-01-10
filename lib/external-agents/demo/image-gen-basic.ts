/**
 * ImageGenBasic Demo Agent
 *
 * Async agent for basic image generation (cheaper, lower quality).
 * Uses Fireworks AI Stable Diffusion (older model).
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

export const imageGenBasicConfig: AgentRegistration = {
  name: 'ImageGenBasic',
  description: 'Basic image generation, lower quality but cheaper',
  url: 'https://agentstack-imagegen-basic.vercel.app/api',
  pricing: { base_price: 0.02, negotiable: false },
  capabilities: 'simple graphics, social images, basic illustrations',
  tags: ['image', 'graphics', 'budget'],
  supports_async: true,
  supports_callback: true,
  wallet: '0x0000000000000000000000000000000000000004',
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
 * ImageGenBasic agent - cheaper alternative with faster model.
 */
export class ImageGenBasicAgent {
  private fireworksApiKey: string;
  private tasks: Map<string, TaskState> = new Map();

  constructor(fireworksApiKey: string) {
    this.fireworksApiKey = fireworksApiKey;
  }

  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponseAsync> {
    const referenceId = crypto.randomUUID();

    this.tasks.set(referenceId, {
      status: 'processing',
      progress: 0,
      callback_url: request.callback_url,
      usage: { total_cost: 0.02 },
    });

    // Start async processing
    this.processImage(referenceId, request.prompt, request.callback_url);

    return {
      status: 'accepted',
      reference_id: referenceId,
      status_url: `/api/status/${referenceId}`,
      estimated_completion_ms: 15000, // Faster than XL
      supports_callback: true,
    };
  }

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

  private async processImage(
    referenceId: string,
    prompt: string,
    callbackUrl?: string
  ): Promise<void> {
    try {
      this.updateTask(referenceId, { progress: 0.3 });

      // Use faster, cheaper model
      const response = await fetch('https://api.fireworks.ai/inference/v1/image_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.fireworksApiKey}`,
        },
        body: JSON.stringify({
          model: 'accounts/fireworks/models/stable-diffusion-v1-5',
          prompt: prompt,
          width: 512,
          height: 512,
          steps: 20, // Fewer steps for speed
        }),
      });

      if (!response.ok) {
        throw new Error(`Fireworks API error: ${response.status}`);
      }

      this.updateTask(referenceId, { progress: 0.8 });

      const data: FireworksImageResponse = await response.json();
      const imageUrl = data.data[0].url;

      const task = this.tasks.get(referenceId);
      if (!task) return;

      const completedTask: TaskState = {
        ...task,
        status: 'completed',
        output: {
          image: {
            url: imageUrl,
            width: 512,
            height: 512,
            format: 'png',
          },
          alt_text: 'Generated image (basic)',
        },
        usage: { total_cost: 0.02 },
      };
      this.tasks.set(referenceId, completedTask);

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
      console.error(`Callback to ${callbackUrl} failed`);
    }
  }
}
