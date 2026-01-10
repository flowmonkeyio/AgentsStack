"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit job
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <form onSubmit={handleSubmit} className="mb-12">
        <div className="flex gap-4">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to accomplish..."
            className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Job
          </button>
        </div>
      </form>

      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Jobs</h2>
        <div className="rounded-md border">
          <div className="p-8 text-center text-muted-foreground">
            No jobs yet. Create your first job above.
          </div>
        </div>
      </section>
    </div>
  );
}
