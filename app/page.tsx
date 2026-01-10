import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

async function RecentJobs() {
  // This would fetch recent jobs for the authenticated user
  // The actual API will be implemented by the API module
  return (
    <div className="rounded-md border border-border">
      <div className="p-8 text-center text-muted-foreground">
        No jobs yet. Create your first job to get started.
      </div>
    </div>
  );
}

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-[calc(100vh-73px)]">
      <SignedOut>
        {/* Landing page for unauthenticated users */}
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] p-8">
          <div className="max-w-3xl text-center">
            <h1 className="text-5xl font-bold tracking-tight mb-6">
              AI Agent Orchestration
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Plan tasks, discover AI agents, verify outputs, and pay via x402.
              Let intelligent agents handle your complex workflows.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <SignInButton mode="modal">
                <button className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Get Started
                </button>
              </SignInButton>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Documentation
              </Link>
            </div>

            {/* Features section */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              <div className="p-6 rounded-lg border border-border">
                <h3 className="font-semibold mb-2">Plan Intelligently</h3>
                <p className="text-sm text-muted-foreground">
                  Describe your goal and let our planning agent break it down into actionable tasks.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border">
                <h3 className="font-semibold mb-2">Discover Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically find the best AI agents for each task based on capabilities and pricing.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border">
                <h3 className="font-semibold mb-2">Verify & Pay</h3>
                <p className="text-sm text-muted-foreground">
                  Quality verification ensures outputs meet your requirements before payment via x402.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Dashboard for authenticated users */}
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Manage your AI agent jobs
              </p>
            </div>
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create New Job
            </Link>
          </div>

          <section>
            <h2 className="text-xl font-semibold mb-4">Recent Jobs</h2>
            <RecentJobs />
          </section>
        </div>
      </SignedIn>
    </div>
  );
}
