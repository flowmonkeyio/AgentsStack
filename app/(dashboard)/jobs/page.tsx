"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/layout";

interface Job {
  job_id: string;
  status: string;
  prompt: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  planning: {
    label: "Planning",
    className: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  plan_verification: {
    label: "Verifying",
    className: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  executing: {
    label: "Executing",
    className: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  awaiting_confirmation: {
    label: "Awaiting",
    className: "bg-[var(--warning-muted)] text-[var(--warning)]",
  },
  completed: {
    label: "Completed",
    className: "bg-[var(--success-muted)] text-[var(--success)]",
  },
  failed: {
    label: "Failed",
    className: "bg-[var(--destructive-muted)] text-[var(--destructive)]",
  },
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/jobs");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      } else {
        setError("Failed to load jobs");
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Filter jobs by status
  const filteredJobs =
    statusFilter === "all"
      ? jobs
      : jobs.filter((j) => j.status === statusFilter);

  // Calculate stats
  const stats = {
    total: jobs.length,
    active: jobs.filter((j) => ["planning", "executing", "plan_verification"].includes(j.status)).length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  const getStatusConfig = (status: string) => {
    return statusConfig[status] || { label: status, className: "bg-[var(--background-subtle)] text-[var(--foreground-muted)]" };
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: "Jobs" }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            Jobs
          </h1>
          <p className="text-foreground-muted mt-1">
            View and manage all your orchestration jobs
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard?create=job")}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create New Job
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--border-hover)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--info-muted)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--info)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <span className="text-sm text-[var(--foreground-muted)] font-medium">Total Jobs</span>
          </div>
          <div className="text-3xl font-heading font-bold text-[var(--foreground)]">{stats.total}</div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--border-hover)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--info-muted)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--info)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <span className="text-sm text-[var(--foreground-muted)] font-medium">Active</span>
          </div>
          <div className="text-3xl font-heading font-bold text-[var(--info)]">{stats.active}</div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--border-hover)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--success-muted)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-[var(--foreground-muted)] font-medium">Completed</span>
          </div>
          <div className="text-3xl font-heading font-bold text-[var(--success)]">{stats.completed}</div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--border-hover)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--destructive-muted)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--destructive)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <span className="text-sm text-[var(--foreground-muted)] font-medium">Failed</span>
          </div>
          <div className="text-3xl font-heading font-bold text-[var(--destructive)]">{stats.failed}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1 bg-[var(--background-subtle)] rounded-xl w-fit">
        {[
          { value: "all", label: "All" },
          { value: "executing", label: "Active" },
          { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`
              px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200
              ${
                statusFilter === tab.value
                  ? "bg-[var(--background-card)] text-[var(--primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-card)]/50"
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin h-8 w-8 text-[var(--primary)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-[var(--foreground-muted)]">Loading jobs...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--destructive-muted)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--destructive)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-[var(--foreground)] font-medium">{error}</p>
            <button onClick={fetchJobs} className="text-[var(--primary)] hover:underline text-sm">
              Try again
            </button>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow)] overflow-hidden">
          <div className="p-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--primary-muted)] to-[var(--secondary-muted)] flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="font-heading text-xl font-bold text-[var(--foreground)] mb-3">No jobs found</h3>
            <p className="text-[var(--foreground-muted)] mb-8 max-w-sm mx-auto leading-relaxed">
              {statusFilter === "all"
                ? "Create your first job to get started with AI agent orchestration."
                : "No jobs with this status at the moment."}
            </p>
            {statusFilter === "all" && (
              <button
                onClick={() => router.push("/dashboard?create=job")}
                className="btn-primary inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Job
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const status = getStatusConfig(job.status);
            return (
              <Link
                key={job.job_id}
                href={`/jobs/${job.job_id}`}
                className="block rounded-2xl bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] p-5 hover:shadow-[var(--shadow-md)] hover:border-[var(--border-hover)] transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-heading font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors truncate">
                        {job.prompt.length > 80 ? job.prompt.slice(0, 80) + "..." : job.prompt}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[var(--foreground-muted)]">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {new Date(job.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-[var(--foreground-subtle)]">ID: {job.job_id.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg ${status.className}`}>
                      {status.label}
                    </span>
                    <svg className="w-5 h-5 text-[var(--foreground-subtle)] group-hover:text-[var(--primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
