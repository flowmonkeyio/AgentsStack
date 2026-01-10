"use client";

import { useState, FormEvent, ChangeEvent } from "react";

/**
 * Props interface for ContinuationInput component
 */
export interface ContinuationInputProps {
  job_id: string;
  onSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean; // Disabled while job is running
}

/**
 * ContinuationInput - Input for user to continue/refine the job
 *
 * Only enabled when job status is "completed"
 *
 * Responsive behavior:
 * - Mobile: Full-width textarea, button below. Fixed to bottom of screen.
 * - Tablet: Full-width textarea, button inline to the right.
 * - Desktop: Same as tablet.
 */
export function ContinuationInput({
  job_id,
  onSubmit,
  disabled = false,
}: ContinuationInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!prompt.trim() || disabled || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(prompt.trim());
      setPrompt(""); // Clear on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue job");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle textarea change
   */
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (error) {
      setError(null);
    }
  };

  const isDisabled = disabled || isSubmitting;
  const canSubmit = prompt.trim().length > 0 && !isDisabled;

  return (
    <div
      className="
        bg-background border border-border rounded-lg p-4
        fixed bottom-0 left-0 right-0 md:relative
        shadow-lg md:shadow-none
        z-10
      "
    >
      <p className="text-sm text-muted-foreground mb-2">
        Want to refine the output?
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row gap-2"
      >
        <textarea
          value={prompt}
          onChange={handleChange}
          placeholder="Describe what you'd like to change..."
          disabled={isDisabled}
          className="
            flex-1
            border border-input rounded-lg p-3
            bg-background text-foreground
            placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            min-h-[80px] md:min-h-[60px]
            resize-none
            text-sm sm:text-base
          "
          aria-label="Continuation prompt"
          aria-describedby={error ? "continuation-error" : undefined}
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="
            px-4 py-2
            bg-primary text-primary-foreground
            font-medium rounded-lg
            hover:bg-primary/90
            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            w-full md:w-auto
            flex items-center justify-center gap-2
            self-end
          "
        >
          {isSubmitting ? (
            <>
              {/* Spinner */}
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
              Continuing...
            </>
          ) : (
            "Continue"
          )}
        </button>
      </form>

      {/* Error message */}
      {error && (
        <p id="continuation-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Disabled state message */}
      {disabled && !isSubmitting && (
        <p className="mt-2 text-xs text-muted-foreground">
          Job must be completed before continuing
        </p>
      )}

      {/* Hidden job_id for accessibility */}
      <input type="hidden" name="job_id" value={job_id} />
    </div>
  );
}

export default ContinuationInput;
