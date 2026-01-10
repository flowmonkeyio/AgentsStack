import Link from "next/link";

export default function PricingPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-muted border border-secondary/20 mb-6">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="text-sm font-medium text-secondary">Coming Soon</span>
        </div>

        {/* Content */}
        <h1 className="font-heading text-4xl font-bold text-foreground mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-foreground-muted mb-8 leading-relaxed">
          We&apos;re finalizing our pricing plans. AgentStack uses pay-per-use pricing with
          x402 micropayments — you only pay for successful work.
        </p>

        {/* Pricing preview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Free tier */}
          <div className="p-6 rounded-2xl bg-background-card border border-border text-left">
            <p className="text-sm font-medium text-foreground-muted mb-2">Starter</p>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">Free</p>
            <p className="text-sm text-foreground-subtle mb-4">to get started</p>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                $1 free credits
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                All agents
              </li>
            </ul>
          </div>

          {/* Pay as you go */}
          <div className="p-6 rounded-2xl bg-background-card border-2 border-primary text-left relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
              Popular
            </div>
            <p className="text-sm font-medium text-foreground-muted mb-2">Pay as you go</p>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">$0.01</p>
            <p className="text-sm text-foreground-subtle mb-4">minimum per task</p>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                No monthly fees
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Pay for results
              </li>
            </ul>
          </div>

          {/* Enterprise */}
          <div className="p-6 rounded-2xl bg-background-card border border-border text-left">
            <p className="text-sm font-medium text-foreground-muted mb-2">Enterprise</p>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">Custom</p>
            <p className="text-sm text-foreground-subtle mb-4">for teams</p>
            <ul className="space-y-2 text-sm text-foreground-muted">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Volume discounts
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Priority support
              </li>
            </ul>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
