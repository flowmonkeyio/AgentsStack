"use client";

import { useState, FormEvent, ChangeEvent } from "react";

/**
 * Props for AgentRegistrationForm
 */
export interface AgentRegistrationFormProps {
  onSubmit: (data: AgentFormData) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

/**
 * Form data structure
 */
export interface AgentFormData {
  name: string;
  description: string;
  capabilities: string;
  endpoint: string;
  wallet: string;
  pricing: {
    basePrice: number;
    currency: string;
    negotiable: boolean;
  };
}

/**
 * Validation errors
 */
interface FormErrors {
  name?: string;
  description?: string;
  capabilities?: string;
  endpoint?: string;
  wallet?: string;
  basePrice?: string;
}

/**
 * AgentRegistrationForm - Register a new agent
 *
 * UI States:
 * - Idle: Form ready for input
 * - Submitting: Button disabled, spinner
 * - Error: Show validation errors
 */
export function AgentRegistrationForm({
  onSubmit,
  onCancel,
  isLoading,
}: AgentRegistrationFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [wallet, setWallet] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  /**
   * Validate form inputs
   */
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = "Agent name is required";
    } else if (name.trim().length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    }

    if (!description.trim()) {
      newErrors.description = "Description is required";
    } else if (description.trim().length < 20) {
      newErrors.description = "Description must be at least 20 characters";
    }

    if (!capabilities.trim()) {
      newErrors.capabilities = "Capabilities description is required";
    } else if (capabilities.trim().length < 20) {
      newErrors.capabilities = "Capabilities must be at least 20 characters";
    }

    if (!endpoint.trim()) {
      newErrors.endpoint = "Endpoint URL is required";
    } else {
      try {
        new URL(endpoint);
      } catch {
        newErrors.endpoint = "Must be a valid URL";
      }
    }

    const priceValue = parseFloat(basePrice);
    if (basePrice && (isNaN(priceValue) || priceValue < 0)) {
      newErrors.basePrice = "Price must be a positive number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      capabilities: capabilities.trim(),
      endpoint: endpoint.trim(),
      wallet: wallet.trim(),
      pricing: {
        basePrice: parseFloat(basePrice) || 0,
        currency: "USDC",
        negotiable,
      },
    });
  };

  /**
   * Clear error on field change
   */
  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Agent Name */}
      <div className="space-y-2">
        <label
          htmlFor="agent-name"
          className="block text-sm font-medium text-foreground"
        >
          Agent Name <span className="text-destructive">*</span>
        </label>
        <input
          id="agent-name"
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setName(e.target.value);
            clearError("name");
          }}
          placeholder="e.g., Content Writer Pro"
          disabled={isLoading}
          className={`
            w-full px-3 py-2
            border rounded-lg
            bg-background text-foreground
            placeholder:text-foreground-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            ${errors.name ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label
          htmlFor="agent-description"
          className="block text-sm font-medium text-foreground"
        >
          Description <span className="text-destructive">*</span>
        </label>
        <textarea
          id="agent-description"
          value={description}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setDescription(e.target.value);
            clearError("description");
          }}
          placeholder="Describe what your agent does..."
          disabled={isLoading}
          rows={3}
          className={`
            w-full px-3 py-2
            border rounded-lg
            bg-background text-foreground
            placeholder:text-foreground-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-y
            ${errors.description ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "description-error" : undefined}
        />
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      {/* Capabilities */}
      <div className="space-y-2">
        <label
          htmlFor="agent-capabilities"
          className="block text-sm font-medium text-foreground"
        >
          Capabilities <span className="text-destructive">*</span>
        </label>
        <textarea
          id="agent-capabilities"
          value={capabilities}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setCapabilities(e.target.value);
            clearError("capabilities");
          }}
          placeholder="Describe the tasks your agent can perform..."
          disabled={isLoading}
          rows={3}
          className={`
            w-full px-3 py-2
            border rounded-lg
            bg-background text-foreground
            placeholder:text-foreground-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-y
            ${errors.capabilities ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.capabilities}
          aria-describedby={errors.capabilities ? "capabilities-error" : undefined}
        />
        {errors.capabilities && (
          <p id="capabilities-error" className="text-sm text-destructive">
            {errors.capabilities}
          </p>
        )}
        <p className="text-xs text-foreground-subtle">
          This is used for discovery - be specific about what your agent excels at.
        </p>
      </div>

      {/* Endpoint URL */}
      <div className="space-y-2">
        <label
          htmlFor="agent-endpoint"
          className="block text-sm font-medium text-foreground"
        >
          Endpoint URL <span className="text-destructive">*</span>
        </label>
        <input
          id="agent-endpoint"
          type="url"
          value={endpoint}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setEndpoint(e.target.value);
            clearError("endpoint");
          }}
          placeholder="https://your-agent-api.com/execute"
          disabled={isLoading}
          className={`
            w-full px-3 py-2
            border rounded-lg
            bg-background text-foreground
            placeholder:text-foreground-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            ${errors.endpoint ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.endpoint}
          aria-describedby={errors.endpoint ? "endpoint-error" : undefined}
        />
        {errors.endpoint && (
          <p id="endpoint-error" className="text-sm text-destructive">
            {errors.endpoint}
          </p>
        )}
      </div>

      {/* Wallet Address */}
      <div className="space-y-2">
        <label
          htmlFor="agent-wallet"
          className="block text-sm font-medium text-foreground"
        >
          Wallet Address
        </label>
        <input
          id="agent-wallet"
          type="text"
          value={wallet}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setWallet(e.target.value);
            clearError("wallet");
          }}
          placeholder="0x..."
          disabled={isLoading}
          className={`
            w-full px-3 py-2
            border rounded-lg
            bg-background text-foreground
            placeholder:text-foreground-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            font-mono text-sm
            ${errors.wallet ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.wallet}
          aria-describedby={errors.wallet ? "wallet-error" : undefined}
        />
        {errors.wallet && (
          <p id="wallet-error" className="text-sm text-destructive">
            {errors.wallet}
          </p>
        )}
        <p className="text-xs text-foreground-subtle">
          For receiving payments via x402 protocol.
        </p>
      </div>

      {/* Pricing */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">Pricing</p>
        <div className="grid grid-cols-2 gap-4">
          {/* Base Price */}
          <div className="space-y-2">
            <label
              htmlFor="agent-price"
              className="block text-xs text-foreground-subtle"
            >
              Base Price (USDC)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle">
                $
              </span>
              <input
                id="agent-price"
                type="number"
                step="0.01"
                min="0"
                value={basePrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setBasePrice(e.target.value);
                  clearError("basePrice");
                }}
                placeholder="0.05"
                disabled={isLoading}
                className={`
                  w-full pl-7 pr-3 py-2
                  border rounded-lg
                  bg-background text-foreground
                  placeholder:text-foreground-subtle
                  focus:outline-none focus:ring-2 focus:ring-ring
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${errors.basePrice ? "border-destructive" : "border-input"}
                `}
                aria-invalid={!!errors.basePrice}
                aria-describedby={errors.basePrice ? "price-error" : undefined}
              />
            </div>
            {errors.basePrice && (
              <p id="price-error" className="text-sm text-destructive">
                {errors.basePrice}
              </p>
            )}
          </div>

          {/* Negotiable */}
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
                disabled={isLoading}
                className="
                  w-4 h-4 rounded border-input
                  text-primary focus:ring-primary focus:ring-offset-0
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
              <span className="text-sm text-foreground">Negotiable</span>
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="
            px-4 py-2
            text-sm font-medium text-foreground
            bg-background border border-input rounded-lg
            hover:bg-background-subtle
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="
            px-4 py-2
            text-sm font-medium
            bg-primary text-primary-foreground rounded-lg
            hover:bg-primary/90
            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            flex items-center gap-2
          "
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Registering...
            </>
          ) : (
            "Register Agent"
          )}
        </button>
      </div>
    </form>
  );
}

export default AgentRegistrationForm;
