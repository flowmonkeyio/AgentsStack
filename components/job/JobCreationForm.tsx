"use client";

import { useState, FormEvent, ChangeEvent } from "react";

/**
 * Props interface for JobCreationForm component
 */
export interface JobCreationFormProps {
  onSubmit: (data: { prompt: string; budget: number }) => Promise<void>;
  isLoading: boolean;
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
 *
 * UI States:
 * - Idle: Form ready for input
 * - Submitting: Button disabled, spinner
 * - Error: Show validation errors
 * - Success: Redirect handled by parent via onSubmit
 */
export function JobCreationForm({ onSubmit, isLoading }: JobCreationFormProps) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Prompt Field */}
      <div className="space-y-2">
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
          placeholder="Describe your task in detail..."
          disabled={isLoading}
          className={`
            w-full
            min-h-[120px] sm:min-h-[150px]
            p-3
            border rounded-lg
            bg-background text-foreground
            placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-y
            ${errors.prompt ? "border-destructive" : "border-input"}
          `}
          aria-invalid={!!errors.prompt}
          aria-describedby={errors.prompt ? "prompt-error" : undefined}
        />
        {errors.prompt && (
          <p id="prompt-error" className="text-sm text-destructive">
            {errors.prompt}
          </p>
        )}
      </div>

      {/* Budget Field */}
      <div className="space-y-2">
        <label
          htmlFor="budget"
          className="block text-sm font-medium text-foreground"
        >
          Budget (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <input
            id="budget"
            type="number"
            step="0.01"
            min="0.01"
            value={budget}
            onChange={handleBudgetChange}
            placeholder="0.00"
            disabled={isLoading}
            className={`
              w-full
              pl-7 pr-3 py-2
              border rounded-lg
              bg-background text-foreground
              placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-ring
              disabled:opacity-50 disabled:cursor-not-allowed
              ${errors.budget ? "border-destructive" : "border-input"}
            `}
            aria-invalid={!!errors.budget}
            aria-describedby={errors.budget ? "budget-error" : undefined}
          />
        </div>
        {errors.budget && (
          <p id="budget-error" className="text-sm text-destructive">
            {errors.budget}
          </p>
        )}
      </div>

      {/* Optional Context Fields (Expandable) */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          className="
            flex items-center gap-2
            text-sm text-muted-foreground
            hover:text-foreground
            transition-colors
          "
          aria-expanded={showContext}
        >
          <svg
            className={`w-4 h-4 transition-transform ${showContext ? "rotate-90" : ""}`}
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
          Additional Context (optional)
        </button>

        {showContext && (
          <div className="space-y-4 pl-6 pt-2">
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
                className="
                  w-full
                  px-3 py-2
                  border border-input rounded-lg
                  bg-background text-foreground
                  placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-ring
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
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
                className="
                  w-full
                  px-3 py-2
                  border border-input rounded-lg
                  bg-background text-foreground
                  placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-ring
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full sm:w-auto
          px-6 py-3
          bg-primary text-primary-foreground
          font-medium rounded-lg
          hover:bg-primary/90
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
          flex items-center justify-center gap-2
        "
      >
        {isLoading ? (
          <>
            {/* Spinner */}
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
          "Create Job"
        )}
      </button>
    </form>
  );
}

export default JobCreationForm;
