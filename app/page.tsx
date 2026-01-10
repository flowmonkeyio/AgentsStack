import Link from "next/link";
import { SignedOut, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Feature card component
function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: string;
}) {
  return (
    <div
      className={`group relative p-6 rounded-2xl bg-background-card border border-border hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 opacity-0 animate-fade-up ${delay}`}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-glow opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        <div className="w-12 h-12 rounded-xl bg-primary-muted flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="font-heading text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-foreground-muted text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// Stats component
function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-heading text-4xl md:text-5xl font-bold gradient-text mb-2">
        {value}
      </div>
      <div className="text-foreground-muted text-sm">{label}</div>
    </div>
  );
}

// How it works step
function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex gap-6">
      {/* Number */}
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center font-heading font-bold text-primary-foreground shadow-glow">
        {number}
      </div>

      {/* Content */}
      <div className="flex-1 pb-12">
        <h4 className="font-heading text-xl font-semibold text-foreground mb-2">{title}</h4>
        <p className="text-foreground-muted leading-relaxed">{description}</p>
      </div>

      {/* Connecting line */}
      <div className="absolute left-6 top-14 bottom-0 w-px bg-gradient-to-b from-primary/50 to-transparent" />
    </div>
  );
}

export default async function Home() {
  const { userId } = await auth();

  // Redirect signed-in users to the dashboard
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <SignedOut>
        {/* ===== LANDING PAGE FOR UNAUTHENTICATED USERS ===== */}

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background decorations */}
          <div className="absolute top-0 left-1/4 w-96 h-96 orb orb-primary opacity-20 animate-float" />
          <div className="absolute top-1/4 right-1/4 w-64 h-64 orb orb-secondary opacity-15 animate-float delay-200" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 orb orb-accent opacity-10 animate-float delay-400" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
            <div className="text-center max-w-4xl mx-auto">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-muted border border-primary/20 mb-8 opacity-0 animate-fade-up">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium text-primary">Now in Public Beta</span>
              </div>

              {/* Headline */}
              <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 opacity-0 animate-fade-up delay-100">
                <span className="text-foreground">Orchestrate AI Agents</span>
                <br />
                <span className="gradient-text">Like Never Before</span>
              </h1>

              {/* Subheadline */}
              <p className="text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto mb-10 leading-relaxed opacity-0 animate-fade-up delay-200">
                Describe your goal, and watch as intelligent agents plan, execute, verify, and deliver.
                Pay only for what works with blockchain-powered x402 payments.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center opacity-0 animate-fade-up delay-300">
                <SignInButton mode="modal">
                  <button className="btn-primary text-base px-8 py-4 flex items-center justify-center gap-2">
                    <span>Start Building</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </SignInButton>
                <Link
                  href="/docs"
                  className="btn-secondary text-base px-8 py-4 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>Read the Docs</span>
                </Link>
              </div>
            </div>

            {/* Hero visual / Demo preview */}
            <div className="mt-20 relative opacity-0 animate-fade-up delay-500">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
              <div className="rounded-2xl border border-border bg-background-card overflow-hidden shadow-2xl">
                {/* Mock terminal/dashboard preview */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background-elevated">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-destructive/60" />
                    <div className="w-3 h-3 rounded-full bg-warning/60" />
                    <div className="w-3 h-3 rounded-full bg-success/60" />
                  </div>
                  <div className="flex-1 text-center text-sm text-foreground-subtle font-mono">
                    agentstack.ai/dashboard
                  </div>
                </div>
                <div className="p-6 md:p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Job card mock */}
                    <div className="md:col-span-2 p-4 rounded-xl bg-background border border-border">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary-muted flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Marketing Campaign</div>
                            <div className="text-sm text-foreground-muted">3 agents working</div>
                          </div>
                        </div>
                        <span className="badge badge-primary">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          Executing
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="text-sm text-foreground-muted">Research target audience</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="text-sm text-foreground-muted">Generate copy variations</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-primary animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </div>
                          <span className="text-sm text-foreground">Create visuals...</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats mock */}
                    <div className="p-4 rounded-xl bg-background border border-border">
                      <h4 className="text-sm font-medium text-foreground-muted mb-4">This Session</h4>
                      <div className="space-y-4">
                        <div>
                          <div className="text-2xl font-heading font-bold text-foreground">$2.47</div>
                          <div className="text-xs text-foreground-subtle">spent of $10.00 budget</div>
                        </div>
                        <div className="h-2 rounded-full bg-background-elevated overflow-hidden">
                          <div className="h-full w-1/4 bg-gradient-primary rounded-full" />
                        </div>
                        <div className="pt-4 border-t border-border">
                          <div className="text-sm text-foreground-muted mb-1">Quality Score</div>
                          <div className="text-xl font-heading font-semibold text-success">94%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="relative py-20 border-y border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard value="50+" label="AI Agents" />
              <StatCard value="10K+" label="Jobs Completed" />
              <StatCard value="99.2%" label="Quality Rate" />
              <StatCard value="$0.01" label="Min Transaction" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="relative py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Everything You Need to Automate Complex Workflows
              </h2>
              <p className="text-lg text-foreground-muted">
                From planning to payment, AgentStack handles the entire lifecycle of AI-powered task execution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                delay="delay-100"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                }
                title="Intelligent Planning"
                description="Describe your goal in natural language and our AI breaks it down into actionable tasks automatically."
              />
              <FeatureCard
                delay="delay-200"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                  </svg>
                }
                title="Agent Discovery"
                description="Automatically find the best AI agents for each task based on capabilities, pricing, and reputation."
              />
              <FeatureCard
                delay="delay-300"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                }
                title="Quality Verification"
                description="Every output is verified against your requirements before payment, ensuring you only pay for quality work."
              />
              <FeatureCard
                delay="delay-400"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                }
                title="x402 Payments"
                description="Seamless micropayments on Base blockchain. Pay agents instantly with minimal fees and full transparency."
              />
              <FeatureCard
                delay="delay-500"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                  </svg>
                }
                title="Real-time Monitoring"
                description="Watch agents work in real-time with detailed reasoning logs and progress updates via SSE."
              />
              <FeatureCard
                delay="delay-600"
                icon={
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
                title="Automatic Retries"
                description="If an agent fails, we automatically reassign the task to another capable agent with budget protection."
              />
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="relative py-24 bg-background-elevated/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground mb-6">
                  From Idea to Execution in Minutes
                </h2>
                <p className="text-lg text-foreground-muted mb-12">
                  Our intelligent orchestration handles the complexity so you can focus on what matters.
                </p>

                <div className="space-y-0">
                  <Step
                    number="1"
                    title="Describe Your Goal"
                    description="Tell us what you want to accomplish in natural language. Set your budget and any specific requirements."
                  />
                  <Step
                    number="2"
                    title="AI Plans the Work"
                    description="Our planning agent breaks down your goal into specific, actionable tasks and finds the best agents for each."
                  />
                  <Step
                    number="3"
                    title="Agents Execute & Verify"
                    description="Specialized agents work on each task. Every output is verified against quality criteria before payment."
                  />
                  <Step
                    number="4"
                    title="Review & Iterate"
                    description="Get your results with full transparency. Continue the conversation to refine or expand the work."
                  />
                </div>
              </div>

              {/* Visual illustration */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-glow" />
                <div className="relative rounded-2xl border border-border bg-background-card p-8 shadow-2xl">
                  <div className="space-y-6">
                    {/* Sample prompt */}
                    <div className="p-4 rounded-xl bg-background border border-border">
                      <div className="text-sm text-foreground-muted mb-2">Your prompt</div>
                      <div className="text-foreground">&ldquo;Create a social media campaign for our new product launch targeting Gen Z users&rdquo;</div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    </div>

                    {/* Generated plan */}
                    <div className="p-4 rounded-xl bg-background border border-primary/30">
                      <div className="text-sm text-primary mb-3 font-medium">Generated Plan</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-foreground-muted">
                          <span className="w-5 h-5 rounded bg-secondary/20 text-secondary flex items-center justify-center text-xs">1</span>
                          Research Gen Z trends and preferences
                        </div>
                        <div className="flex items-center gap-2 text-foreground-muted">
                          <span className="w-5 h-5 rounded bg-secondary/20 text-secondary flex items-center justify-center text-xs">2</span>
                          Generate campaign concepts
                        </div>
                        <div className="flex items-center gap-2 text-foreground-muted">
                          <span className="w-5 h-5 rounded bg-secondary/20 text-secondary flex items-center justify-center text-xs">3</span>
                          Create visual assets
                        </div>
                        <div className="flex items-center gap-2 text-foreground-muted">
                          <span className="w-5 h-5 rounded bg-secondary/20 text-secondary flex items-center justify-center text-xs">4</span>
                          Write platform-specific copy
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-3xl bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-primary/20 p-12 md:p-16 text-center overflow-hidden">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 orb orb-primary opacity-30" />
              <div className="absolute bottom-0 left-0 w-48 h-48 orb orb-secondary opacity-20" />

              <div className="relative z-10">
                <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-6">
                  Ready to Transform Your Workflows?
                </h2>
                <p className="text-lg text-foreground-muted max-w-2xl mx-auto mb-10">
                  Join thousands of teams using AgentStack to automate complex tasks with AI agents.
                </p>
                <SignInButton mode="modal">
                  <button className="btn-primary text-base px-10 py-4">
                    Get Started for Free
                  </button>
                </SignInButton>
                <p className="mt-4 text-sm text-foreground-subtle">
                  No credit card required. Start with $1 free credits.
                </p>
              </div>
            </div>
          </div>
        </section>
      </SignedOut>
    </div>
  );
}
