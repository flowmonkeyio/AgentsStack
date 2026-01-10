"use client";

import { useState, FormEvent, ChangeEvent } from "react";

/**
 * Props interface for JobCreationForm component
 */
export interface JobCreationFormProps {
  onSubmit: (data: { prompt: string; budget: number }) => Promise<void>;
  isLoading: boolean;
  error?: { field: string; message: string };
}

/**
 * Form validation errors
 */
interface FormErrors {
  prompt?: string;
  budget?: string;
}

/**
 * JobCreationForm - Create a new job with prompt and budget
 */
export function JobCreationForm({ onSubmit, isLoading, error }: JobCreationFormProps) {
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [context, setContext] = useState<{
    product?: string;
    users?: string;
  }>({});
  const [errors, setErrors] = useState<FormErrors>({});

  /**
   * Validate form inputs
   */
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Prompt validation: required, min 10 chars
    if (!prompt.trim()) {
      newErrors.prompt = "Prompt is required";
    } else if (prompt.trim().length < 10) {
      newErrors.prompt = "Prompt must be at least 10 characters";
    }

    // Budget validation: required, min 0.01
    const budgetValue = parseFloat(budget);
    if (!budget) {
      newErrors.budget = "Budget is required";
    } else if (isNaN(budgetValue) || budgetValue < 0.01) {
      newErrors.budget = "Budget must be at least $0.01";
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
      prompt: prompt.trim(),
      budget: parseFloat(budget),
    });
  };

  /**
   * Handle prompt input change
   */
  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (errors.prompt) {
      setErrors((prev) => ({ ...prev, prompt: undefined }));
    }
  };

  /**
   * Handle budget input change
   */
  const handleBudgetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBudget(e.target.value);
    if (errors.budget) {
      setErrors((prev) => ({ ...prev, budget: undefined }));
    }
  };

  // Check for external field errors
  const promptError = errors.prompt || (error?.field === "prompt" ? error.message : undefined);
  const budgetError = errors.budget || (error?.field === "budget" ? error.message : undefined);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Prompt Field */}
      <div className="space-y-3">
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-foreground"
        >
          What would you like to create?
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={handlePromptChange}
          placeholder="Describe your task in detail. For example: Create a marketing campaign for a new SaaS product targeting small businesses..."
          disabled={isLoading}
          rows={5}
          className={`
            w-full input-field resize-y min-h-[140px]
            ${promptError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}
          `}
          aria-invalid={!!promptError}
          aria-describedby={promptError ? "prompt-error" : undefined}
        />
        {promptError && (
          <p id="prompt-error" className="text-sm text-destructive flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {promptError}
          </p>
        )}
      </div>

      {/* Budget Field */}
      <div className="space-y-3">
        <label
          htmlFor="budget"
          className="block text-sm font-medium text-foreground"
        >
          Budget (USD)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted font-medium">
            $
          </span>
          <input
            id="budget"
            type="number"
            step="0.01"
            min="0.01"
            value={budget}
            onChange={handleBudgetChange}
            placeholder="10.00"
            disabled={isLoading}
            className={`
              w-full input-field pl-8
              ${budgetError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}
            `}
            aria-invalid={!!budgetError}
            aria-describedby={budgetError ? "budget-error" : undefined}
          />
        </div>
        {budgetError && (
          <p id="budget-error" className="text-sm text-destructive flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {budgetError}
          </p>
        )}
        <p className="text-xs text-foreground-subtle">
          You only pay for verified, quality outputs. Unused budget is refunded.
        </p>
      </div>

      {/* Optional Context Fields (Expandable) */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          className="flex items-center gap-2 text-sm font-medium text-foreground-muted hover:text-primary transition-colors group"
          aria-expanded={showContext}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${showContext ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="group-hover:text-primary transition-colors">Additional Context</span>
          <span className="text-foreground-subtle text-xs">(optional)</span>
        </button>

        {showContext && (
          <div className="space-y-4 pl-6 pt-2 border-l-2 border-border animate-fade-in">
            <div className="space-y-2">
              <label
                htmlFor="product"
                className="block text-sm font-medium text-foreground"
              >
                Product/Service
              </label>
              <input
                id="product"
                type="text"
                value={context.product || ""}
                onChange={(e) =>
                  setContext({ ...context, product: e.target.value })
                }
                placeholder="What product or service is this for?"
                disabled={isLoading}
                className="w-full input-field"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="users"
                className="block text-sm font-medium text-foreground"
              >
                Target Users
              </label>
              <input
                id="users"
                type="text"
                value={context.users || ""}
                onChange={(e) =>
                  setContext({ ...context, users: e.target.value })
                }
                placeholder="Who is the target audience?"
                disabled={isLoading}
                className="w-full input-field"
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
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
            Creating Job...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Create Job
          </>
        )}
      </button>
    </form>
  );
}

export default JobCreationForm;
