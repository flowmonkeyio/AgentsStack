/**
 * Security Module
 *
 * HMAC signature verification for webhook callbacks.
 * Required for production deployments to prevent spoofing attacks.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import crypto from "crypto";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Expected signature header format prefix
 */
const SIGNATURE_PREFIX = "sha256=";

/**
 * Environment variable to allow unsigned webhooks (development only)
 */
const ALLOW_UNSIGNED_WEBHOOKS_VAR = "ALLOW_UNSIGNED_WEBHOOKS";

// =============================================================================
// HMAC VERIFICATION
// =============================================================================

/**
 * Verifies HMAC-SHA256 signature on webhook callback.
 * Signature is passed in X-Webhook-Signature header.
 *
 * Format: sha256=<hex_signature>
 *
 * The signature is computed over the raw request body using the agent's
 * webhook_secret (stored during agent registration).
 *
 * @param body - Raw request body as string
 * @param signature - X-Webhook-Signature header value (or undefined if missing)
 * @param webhookSecret - Agent's webhook secret for HMAC computation
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  webhookSecret: string
): boolean {
  if (!signature) {
    // In production, missing signature should be rejected
    // During development/testing, can be allowed if ALLOW_UNSIGNED_WEBHOOKS=true
    return process.env[ALLOW_UNSIGNED_WEBHOOKS_VAR] === "true";
  }

  // Validate signature format
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  // Extract signature value (after "sha256=")
  const receivedSignature = signature.slice(SIGNATURE_PREFIX.length);

  // Validate hex format
  if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) {
    return false;
  }

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body, "utf8")
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}

// =============================================================================
// SIGNATURE GENERATION (for testing/documentation)
// =============================================================================

/**
 * Generate an HMAC-SHA256 signature for a request body.
 * Used by agents to sign their webhook callbacks.
 *
 * @param body - Request body as string
 * @param secret - Webhook secret
 * @returns Signature in format "sha256=<hex>"
 */
export function generateWebhookSignature(body: string, secret: string): string {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");
  return `${SIGNATURE_PREFIX}${signature}`;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a string looks like a valid webhook secret.
 * Secrets should be at least 32 characters for security.
 *
 * @param secret - The secret to validate
 * @returns true if the secret appears valid
 */
export function isValidWebhookSecret(secret: string): boolean {
  // Minimum 32 characters (256 bits of entropy when using hex)
  return typeof secret === "string" && secret.length >= 32;
}

/**
 * Generate a secure webhook secret.
 * Use this when registering new agents.
 *
 * @returns A 64-character hex string (256 bits)
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// =============================================================================
// REQUEST VALIDATION
// =============================================================================

/**
 * Signature verification result
 */
export interface SignatureVerificationResult {
  /** Whether the signature was verified successfully */
  valid: boolean;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Verify webhook signature with detailed error reporting.
 * Use this in API routes for better error messages.
 *
 * @param body - Raw request body
 * @param signature - X-Webhook-Signature header
 * @param webhookSecret - Agent's webhook secret (or undefined if not configured)
 * @param isProduction - Whether running in production mode
 * @returns Verification result with error details
 */
export function verifyWebhookSignatureWithDetails(
  body: string,
  signature: string | undefined,
  webhookSecret: string | undefined,
  isProduction: boolean
): SignatureVerificationResult {
  // Check if webhook secret is configured
  if (!webhookSecret) {
    if (isProduction) {
      return {
        valid: false,
        error: "Agent webhook_secret not configured",
      };
    }
    // In development, allow unsigned if env var is set
    if (process.env[ALLOW_UNSIGNED_WEBHOOKS_VAR] === "true") {
      return { valid: true };
    }
    return {
      valid: false,
      error: "Agent webhook_secret not configured and unsigned webhooks not allowed",
    };
  }

  // Check if signature is present
  if (!signature) {
    if (process.env[ALLOW_UNSIGNED_WEBHOOKS_VAR] === "true") {
      return { valid: true };
    }
    return {
      valid: false,
      error: "Missing X-Webhook-Signature header",
    };
  }

  // Validate signature format
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return {
      valid: false,
      error: `Invalid signature format - expected ${SIGNATURE_PREFIX}<hex>`,
    };
  }

  // Verify the signature
  const isValid = verifyWebhookSignature(body, signature, webhookSecret);
  if (!isValid) {
    return {
      valid: false,
      error: "Invalid webhook signature",
    };
  }

  return { valid: true };
}
