"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AgentCard, AgentData, AgentRegistrationForm, AgentFormData } from "@/components/agent";

/**
 * Stats for the agents overview
 */
interface AgentStats {
  total: number;
  active: number;
  pendingReview: number;
  avgScore: number;
}

/**
 * AgentsPage - List and manage agents
 *
 * Features:
 * - List all agents with filtering by status
 * - Register new agent modal
 * - Quick stats overview
 */
export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasFetched = useRef(false);

  /**
   * Calculate stats from agents
   */
  const stats: AgentStats = {
    total: agents.length,
    active: agents.filter((a) => a.status === "active").length,
    pendingReview: agents.filter((a) => a.status === "pending_review").length,
    avgScore:
      agents.length > 0
        ? agents.reduce((sum, a) => sum + (a.metrics.averageScore || 0), 0) /
          agents.length
        : 0,
  };

  /**
   * Fetch agents from API
   */
  const fetchAgents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Single fetch for all agents - filter client-side
      const response = await fetch("/api/agents?limit=100");
      const data = await response.json();

      setAgents(data.agents || []);
    } catch (err) {
      setError("Failed to load agents. Please try again.");
      console.error("Failed to fetch agents:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAgents();
  }, [fetchAgents]);

  /**
   * Filter agents by status
   */
  const filteredAgents =
    statusFilter === "all"
      ? agents
      : agents.filter((a) => a.status === statusFilter);

  /**
   * Handle agent registration
   */
  const handleRegisterAgent = async (data: AgentFormData) => {
    try {
      setIsSubmitting(true);

      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to register agent");
      }

      // Refresh agent list
      await fetchAgents();
      setShowRegistrationModal(false);
    } catch (err) {
      console.error("Failed to register agent:", err);
      throw err; // Let the form handle error display
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            Agents
          </h1>
          <p className="text-foreground-muted mt-1">
            Discover and manage available agents
          </p>
        </div>
        <button
          onClick={() => setShowRegistrationModal(true)}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Register Agent
        </button>
      </div>

      {/* Stats Grid - matching dashboard style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-info-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Total Agents</span>
          </div>
          <div className="text-3xl font-heading font-bold text-foreground">{stats.total}</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-success-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Active</span>
          </div>
          <div className="text-3xl font-heading font-bold text-success">{stats.active}</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-warning-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Pending Review</span>
          </div>
          <div className="text-3xl font-heading font-bold text-warning">{stats.pendingReview}</div>
        </div>

        <div className="p-5 rounded-xl bg-background-card border border-border group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary-muted flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <span className="text-sm text-foreground-muted">Avg Score</span>
          </div>
          <div className="text-3xl font-heading font-bold text-primary">
            {stats.avgScore > 0 ? stats.avgScore.toFixed(1) : "--"}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "pending_review", label: "Pending" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`
              px-4 py-2.5 text-sm font-medium transition-colors
              border-b-2 -mb-px
              ${
                statusFilter === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground-muted hover:text-foreground"
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
            <svg
              className="animate-spin h-8 w-8 text-primary"
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
            <p className="text-foreground-muted">Loading agents...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-destructive-muted flex items-center justify-center">
              <svg
                className="w-8 h-8 text-destructive"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="text-foreground font-medium">{error}</p>
            <button
              onClick={fetchAgents}
              className="text-primary hover:underline text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="rounded-2xl bg-background-card border border-border overflow-hidden">
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">No agents found</h3>
            <p className="text-foreground-muted mb-6 max-w-sm mx-auto">
              {statusFilter === "all"
                ? "Register your first agent to get started."
                : "No agents with this status."}
            </p>
            {statusFilter === "all" && (
              <button
                onClick={() => setShowRegistrationModal(true)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Register Agent
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent._id} agent={agent} />
          ))}
        </div>
      )}

      {/* Registration Modal */}
      {showRegistrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => !isSubmitting && setShowRegistrationModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-background-card border border-border rounded-2xl shadow-xl animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-background-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Register New Agent
              </h2>
              <button
                onClick={() => !isSubmitting && setShowRegistrationModal(false)}
                disabled={isSubmitting}
                className="
                  p-2 rounded-lg
                  text-foreground-muted hover:text-foreground
                  hover:bg-background-subtle
                  transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="p-6">
              <AgentRegistrationForm
                onSubmit={handleRegisterAgent}
                onCancel={() => setShowRegistrationModal(false)}
                isLoading={isSubmitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
