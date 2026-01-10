"use client";

import { useState, FormEvent, ChangeEvent } from "react";

/**
 * Props interface for ContinuationInput component
 */
export interface ContinuationInputProps {
  job_id: string;
  onSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * ContinuationInput - Input for user to continue/refine the job with premium styling
 */
export function ContinuationInput({
  job_id,
  onSubmit,
  disabled = false,
}: ContinuationInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!prompt.trim() || disabled || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(prompt.trim());
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue job");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        rounded-xl bg-background-card border border-border p-5
        fixed bottom-0 left-0 right-0 md:relative
        shadow-2xl md:shadow-none
        z-10
      "
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary-muted flex items-center justify-center">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h3 className="font-heading font-semibold text-foreground text-sm">Continue the conversation</h3>
          <p className="text-xs text-foreground-muted">Refine or expand on the output</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={handleChange}
            placeholder="Describe what you'd like to change or add..."
            disabled={isDisabled}
            className="
              w-full input-field
              min-h-[100px] md:min-h-[80px]
              resize-none
              pr-24
            "
            aria-label="Continuation prompt"
            aria-describedby={error ? "continuation-error" : undefined}
          />

          {/* Submit button positioned inside textarea on desktop */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="
              hidden md:flex
              absolute bottom-3 right-3
              btn-primary py-2 px-4 text-sm
              disabled:opacity-50 disabled:cursor-not-allowed
              items-center gap-2
            "
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
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
                Sending
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send
              </>
            )}
          </button>
        </div>

        {/* Mobile submit button */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="
            md:hidden
            btn-primary w-full py-3
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
          "
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
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
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Continue
            </>
          )}
        </button>
      </form>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-destructive-muted border border-destructive/20 flex items-center gap-2">
          <svg className="w-4 h-4 text-destructive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p id="continuation-error" className="text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      {/* Disabled state message */}
      {disabled && !isSubmitting && (
        <p className="mt-3 text-xs text-foreground-muted text-center">
          Job must be completed before continuing
        </p>
      )}

      <input type="hidden" name="job_id" value={job_id} />
    </div>
  );
}

export default ContinuationInput;
