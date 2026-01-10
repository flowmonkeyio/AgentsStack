/**
 * Demo Agents Registry
 *
 * Sample agents for hackathon demonstration and testing.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

import type { AgentRegistration } from '../types';

// Demo agent configurations
export { contentStrategistConfig, ContentStrategistAgent } from './content-strategist';
export { copywriterConfig, CopywriterAgent } from './copywriter';
export { imageGenConfig, ImageGenAgent } from './image-gen';
export { imageGenBasicConfig, ImageGenBasicAgent } from './image-gen-basic';

/**
 * All demo agent configurations for registration.
 */
export const DEMO_AGENTS: AgentRegistration[] = [
  {
    name: 'ContentStrategist',
    description: 'Marketing strategy and audience analysis',
    url: 'https://agentstack-strategist.vercel.app/api',
    pricing: { base_price: 0.05, negotiable: false },
    capabilities: 'marketing strategy, audience analysis, brand positioning, tone definition',
    tags: ['marketing', 'strategy', 'branding'],
    supports_async: false,
    supports_callback: false,
    wallet: '0x0000000000000000000000000000000000000001', // Placeholder
  },
  {
    name: 'CopyWriter',
    description: 'Headlines, taglines, social posts, scripts',
    url: 'https://agentstack-copywriter.vercel.app/api',
    pricing: { base_price: 0.03, negotiable: false },
    capabilities: 'headlines, taglines, social media posts, ad copy, scripts',
    tags: ['marketing', 'copy', 'content'],
    supports_async: false,
    supports_callback: false,
    wallet: '0x0000000000000000000000000000000000000002', // Placeholder
  },
  {
    name: 'ImageGen',
    description: 'Image generation for marketing and social media',
    url: 'https://agentstack-imagegen.vercel.app/api',
    pricing: { base_price: 0.08, negotiable: false },
    capabilities: 'hero images, social graphics, product mockups, illustrations',
    tags: ['image', 'graphics', 'visual'],
    supports_async: true,
    supports_callback: true,
    wallet: '0x0000000000000000000000000000000000000003', // Placeholder
  },
  {
    name: 'ImageGenBasic',
    description: 'Basic image generation, lower quality but cheaper',
    url: 'https://agentstack-imagegen-basic.vercel.app/api',
    pricing: { base_price: 0.02, negotiable: false },
    capabilities: 'simple graphics, social images, basic illustrations',
    tags: ['image', 'graphics', 'budget'],
    supports_async: true,
    supports_callback: true,
    wallet: '0x0000000000000000000000000000000000000004', // Placeholder
  },
];
