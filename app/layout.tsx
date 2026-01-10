import type { Metadata } from "next";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { CreditsDisplay } from "@/components/layout/CreditsDisplay";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentStack | AI Agent Orchestration Platform",
  description: "Plan tasks, discover AI agents, verify outputs, and pay seamlessly. The future of intelligent workflow automation.",
};

// Logo component with animated gradient
function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* Animated logo mark */}
      <div className="relative w-9 h-9">
        <div className="absolute inset-0 bg-gradient-primary rounded-lg opacity-80 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-primary-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
        </div>
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-primary rounded-lg blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
      </div>

      {/* Logo text */}
      <span className="font-heading text-xl font-bold tracking-tight">
        <span className="text-foreground">Agent</span>
        <span className="gradient-text">Stack</span>
      </span>
    </Link>
  );
}

// Navigation links
function NavLinks() {
  return (
    <div className="hidden md:flex items-center gap-1">
      <Link
        href="/docs"
        className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors rounded-lg hover:bg-primary-muted"
      >
        Docs
      </Link>
      <Link
        href="/pricing"
        className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors rounded-lg hover:bg-primary-muted"
      >
        Pricing
      </Link>
    </div>
  );
}

// Auth buttons for signed out state
function AuthButtons() {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/sign-in"
        className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/sign-up"
        className="btn-primary text-sm"
      >
        Get Started
      </Link>
    </div>
  );
}

// Authenticated user menu
function UserMenu() {
  return (
    <div className="flex items-center gap-3">
      <CreditsDisplay />
      <div className="h-6 w-px bg-border" />
      <UserButton
        afterSignOutUrl="/"
        appearance={{
          elements: {
            avatarBox: "w-9 h-9 ring-2 ring-primary/20 hover:ring-primary/40 transition-all",
          }
        }}
      />
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background antialiased">
          {/* Gradient mesh background */}
          <div className="fixed inset-0 bg-mesh pointer-events-none" />
          <div className="fixed inset-0 bg-grid pointer-events-none opacity-40" />

          {/* Header */}
          <header className="relative z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                {/* Left: Logo + Nav */}
                <div className="flex items-center gap-8">
                  <Logo />
                  <NavLinks />
                </div>

                {/* Right: Auth */}
                <div className="flex items-center">
                  <SignedOut>
                    <AuthButtons />
                  </SignedOut>
                  <SignedIn>
                    <UserMenu />
                  </SignedIn>
                </div>
              </div>
            </nav>
          </header>

          {/* Main content */}
          <main className="relative z-10">
            {children}
          </main>

          {/* Footer */}
          <footer className="relative z-10 border-t border-border/50 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {/* Brand */}
                <div className="col-span-2 md:col-span-1">
                  <Logo />
                  <p className="mt-4 text-sm text-foreground-muted max-w-xs">
                    The future of AI agent orchestration. Plan, execute, verify, and pay seamlessly.
                  </p>
                </div>

                {/* Product */}
                <div>
                  <h4 className="font-heading font-semibold text-sm text-foreground mb-4">Product</h4>
                  <ul className="space-y-3">
                    <li><Link href="/docs" className="text-sm text-foreground-muted hover:text-primary transition-colors">Documentation</Link></li>
                    <li><Link href="/pricing" className="text-sm text-foreground-muted hover:text-primary transition-colors">Pricing</Link></li>
                    <li><Link href="/agents" className="text-sm text-foreground-muted hover:text-primary transition-colors">Agent Registry</Link></li>
                  </ul>
                </div>

                {/* Company */}
                <div>
                  <h4 className="font-heading font-semibold text-sm text-foreground mb-4">Company</h4>
                  <ul className="space-y-3">
                    <li><Link href="/about" className="text-sm text-foreground-muted hover:text-primary transition-colors">About</Link></li>
                    <li><Link href="/blog" className="text-sm text-foreground-muted hover:text-primary transition-colors">Blog</Link></li>
                    <li><Link href="/careers" className="text-sm text-foreground-muted hover:text-primary transition-colors">Careers</Link></li>
                  </ul>
                </div>

                {/* Legal */}
                <div>
                  <h4 className="font-heading font-semibold text-sm text-foreground mb-4">Legal</h4>
                  <ul className="space-y-3">
                    <li><Link href="/privacy" className="text-sm text-foreground-muted hover:text-primary transition-colors">Privacy</Link></li>
                    <li><Link href="/terms" className="text-sm text-foreground-muted hover:text-primary transition-colors">Terms</Link></li>
                  </ul>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="mt-12 pt-8 border-t border-border/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-sm text-foreground-subtle">
                  &copy; {new Date().getFullYear()} AgentStack. All rights reserved.
                </p>
                <div className="flex items-center gap-4">
                  <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-foreground-subtle hover:text-primary transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-foreground-subtle hover:text-primary transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                    </svg>
                  </a>
                  <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="text-foreground-subtle hover:text-primary transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
