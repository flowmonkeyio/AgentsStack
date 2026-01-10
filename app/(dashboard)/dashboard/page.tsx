"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { JobCreationForm } from "@/components/job/JobCreationForm";
import { api, APIClientError } from "@/lib/api-client";

interface FormError {
  field?: string;
  message: string;
}

interface Job {
  job_id: string;
  status: string;
  prompt: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showJobModal, setShowJobModal] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      setIsLoadingJobs(true);
      const response = await fetch("/api/jobs");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Open modal if URL has ?create=job
  useEffect(() => {
    if (searchParams.get("create") === "job") {
      setShowJobModal(true);
      // Clean up URL
      router.replace("/dashboard", { scroll: false });
    }
  }, [searchParams, router]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const handleCreateJob = async (data: { prompt: string; budget: number }) => {
    setIsSubmitting(true);
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
          setError({ message: "Please sign in to create a job." });
        } else if (err.code === "BUDGET_TOO_LOW") {
          setError({ field: "budget", message: err.message });
        } else {
          setError({ message: err.message || "Failed to create job. Please try again." });
        }
      } else {
        setError({ message: "An unexpected error occurred. Please try again." });
      }
      throw err; // Re-throw so form knows it failed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-foreground-muted mt-1">
            Manage your AI agent jobs and track progress
          </p>
        </div>
        <button
          onClick={() => setShowJobModal(true)}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create New Job
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-info-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Active Jobs</span>
          </div>
          <div className="text-3xl font-heading font-bold text-foreground">0</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-success-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Completed</span>
          </div>
          <div className="text-3xl font-heading font-bold text-success">0</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Total Spent</span>
          </div>
          <div className="text-3xl font-heading font-bold text-foreground">$0.00</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Avg Quality</span>
          </div>
          <div className="text-3xl font-heading font-bold text-primary">--</div>
        </div>
      </div>

      {/* Recent Jobs */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-xl font-semibold text-foreground">Recent Jobs</h2>
          <Link href="/jobs" className="text-sm text-primary hover:text-primary-hover transition-colors">
            View all
          </Link>
        </div>

        {isLoadingJobs ? (
          <div className="rounded-2xl bg-background-card border border-border p-12 text-center">
            <svg className="animate-spin h-8 w-8 text-primary mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-foreground-muted mt-4">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl bg-background-card border border-border overflow-hidden">
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground mb-2">No jobs yet</h3>
              <p className="text-foreground-muted mb-6 max-w-sm mx-auto">
                Create your first job to get started with AI agent orchestration.
              </p>
              <button
                onClick={() => setShowJobModal(true)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Job
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-background-card border border-border overflow-hidden divide-y divide-border">
            {jobs.slice(0, 5).map((job) => (
              <Link
                key={job.job_id}
                href={`/jobs/${job.job_id}`}
                className="flex items-center justify-between p-4 hover:bg-background-subtle transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium truncate group-hover:text-primary transition-colors">
                    {job.prompt.length > 60 ? job.prompt.slice(0, 60) + "..." : job.prompt}
                  </p>
                  <p className="text-sm text-foreground-muted mt-0.5">
                    {new Date(job.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase tracking-wide ${
                      job.status === "completed"
                        ? "bg-success-muted text-success"
                        : job.status === "failed"
                        ? "bg-destructive-muted text-destructive"
                        : job.status === "executing" || job.status === "planning"
                        ? "bg-info-muted text-info"
                        : "bg-background-subtle text-foreground-muted"
                    }`}
                  >
                    {job.status}
                  </span>
                  <svg className="w-5 h-5 text-foreground-subtle group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Job Creation Modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => !isSubmitting && setShowJobModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-background-card border border-border rounded-2xl shadow-xl animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-background-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Create New Job
              </h2>
              <button
                onClick={() => !isSubmitting && setShowJobModal(false)}
                disabled={isSubmitting}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error display */}
            {error && !error.field && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-destructive-muted border border-destructive/20 flex items-start gap-3">
                <svg className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-destructive text-sm">{error.message}</span>
              </div>
            )}

            {/* Form */}
            <div className="p-6">
              <JobCreationForm
                onSubmit={handleCreateJob}
                isLoading={isSubmitting}
                error={error?.field ? { field: error.field, message: error.message } : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
