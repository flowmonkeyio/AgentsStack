"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { JobCreationForm } from "@/components/job/JobCreationForm";
import { api, APIClientError } from "@/lib/api-client";

interface FormError {
  field?: string;
  message: string;
}

export default function NewJobPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Handle form submission
  const handleSubmit = async (data: { prompt: string; budget: number }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.createJob({
        prompt: data.prompt,
        budget: data.budget,
      });

      // Redirect to job detail page on success
      router.push(`/jobs/${response.job_id}`);
    } catch (err) {
      if (err instanceof APIClientError) {
        if (err.code === "INVALID_INPUT") {
          setError({
            field: err.details?.field as string | undefined,
            message: err.message,
          });
        } else if (err.status === 401) {
          setError({
            message: "Please sign in to create a job.",
          });
        } else if (err.code === "BUDGET_TOO_LOW") {
          setError({
            field: "budget",
            message: err.message,
          });
        } else {
          setError({
            message: err.message || "Failed to create job. Please try again.",
          });
        }
      } else {
        setError({
          message: "An unexpected error occurred. Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-muted rounded w-2/3 mb-8"></div>
            <div className="h-32 bg-muted rounded mb-4"></div>
            <div className="h-10 bg-muted rounded w-1/4"></div>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to sign in if not authenticated
  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">Sign In Required</h1>
          <p className="text-muted-foreground mb-6">
            Please sign in to create a new job.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Create New Job</h1>
          <p className="text-muted-foreground">
            Describe what you want to accomplish and set your budget.
            Our AI agents will plan and execute your request.
          </p>
        </div>

        {/* Error display */}
        {error && !error.field && (
          <div className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
            {error.message}
          </div>
        )}

        {/* Job creation form */}
        <JobCreationForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error?.field ? { field: error.field, message: error.message } : undefined}
        />

        {/* Help text */}
        <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
          <h3 className="font-semibold mb-2">Tips for a good prompt:</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Be specific about what you want to achieve</li>
            <li>Include any constraints or preferences</li>
            <li>Mention the format you need for deliverables</li>
            <li>Set a budget that matches the complexity of your request</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
