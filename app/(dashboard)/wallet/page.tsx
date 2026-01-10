"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface Transaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
  status: string;
}

interface WalletData {
  address: string;
  type: "embedded" | "external";
  provider: string;
  verified: boolean;
  balance: number;
  credits: number;
  network: string;
  transactions: Transaction[];
}

// Wallet Setup Component - Enter wallet address
function WalletSetup({ onSetupComplete }: { onSetupComplete: () => void }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<"input" | "syncing" | "complete">("input");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!walletAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    // Basic validation
    if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      setError("Please enter a valid Ethereum wallet address (0x...)");
      return;
    }

    setIsSubmitting(true);
    setSetupStep("syncing");

    try {
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          provider: "coinbase",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to setup wallet");
      }

      setSetupStep("complete");
      setTimeout(() => {
        onSetupComplete();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup wallet");
      setSetupStep("input");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (setupStep === "syncing") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-primary animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
            Syncing Wallet
          </h2>
          <p className="text-foreground-muted">
            Connecting to Coinbase and fetching your balance...
          </p>
        </div>
      </div>
    );
  }

  if (setupStep === "complete") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-success-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
            Wallet Connected!
          </h2>
          <p className="text-foreground-muted">
            Your wallet is synced. Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
          </div>
          <h1 className="font-heading text-3xl font-bold text-foreground mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-foreground-muted">
            Enter your Coinbase wallet address to sync your balance and start using AgentStack
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl bg-background-card border border-border p-6">
            <label className="block text-sm font-medium text-foreground mb-2">
              Wallet Address
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              className="w-full input-field font-mono text-sm"
              disabled={isSubmitting}
            />
            <p className="mt-2 text-xs text-foreground-subtle">
              Enter your Ethereum/Base wallet address (USDC on Base network)
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-destructive-muted border border-destructive/20 flex items-start gap-3">
              <svg className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !walletAddress.trim()}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Connecting..." : "Connect Wallet"}
          </button>
        </form>

        {/* Help text */}
        <div className="mt-8 p-4 rounded-xl bg-info-muted/30 border border-info/10">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-info flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-foreground-muted">
              <p className="font-medium text-foreground mb-1">Need a wallet?</p>
              <p>
                You can create a wallet on{" "}
                <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Coinbase Wallet
                </a>
                {" "}and fund it with USDC on the Base network.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Wallet Page
export default function WalletPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const fetchWallet = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/wallet");

      if (!response.ok && response.status !== 200) {
        throw new Error("Failed to fetch wallet");
      }

      const data = await response.json();

      if (data.needsSetup || !data.wallet?.address) {
        setNeedsSetup(true);
        setWallet(null);
        return;
      }

      setWallet(data.wallet);
      setNeedsSetup(false);
    } catch (err) {
      setError("Failed to load wallet. Please try again.");
      console.error("Failed to fetch wallet:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  // Check if we should show setup from URL param
  useEffect(() => {
    if (searchParams.get("setup") === "true") {
      setNeedsSetup(true);
      // Clean up URL
      router.replace("/wallet", { scroll: false });
    }
  }, [searchParams, router]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-background-card rounded-lg w-1/4" />
          <div className="h-4 bg-background-card rounded-lg w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-40 bg-background-card rounded-xl" />
            <div className="h-40 bg-background-card rounded-xl" />
            <div className="h-40 bg-background-card rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !needsSetup) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-foreground font-medium">{error}</p>
          <button onClick={fetchWallet} className="text-primary hover:underline text-sm">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Show setup flow if no wallet exists
  if (needsSetup) {
    return <WalletSetup onSetupComplete={fetchWallet} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Wallet</h1>
        <p className="text-foreground-muted mt-1">
          Manage your credits and view transaction history
        </p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Available Credits */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-muted flex items-center justify-center">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Available Credits</p>
              <p className="text-3xl font-heading font-bold text-foreground">
                ${wallet?.credits?.toFixed(2) ?? "0.00"}
              </p>
            </div>
          </div>
          <p className="text-xs text-foreground-subtle">USDC on Base network</p>
        </div>

        {/* Wallet Balance */}
        <div className="p-6 rounded-2xl bg-background-card border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-success-muted flex items-center justify-center">
              <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">USDC Balance</p>
              <p className="text-3xl font-heading font-bold text-foreground">
                ${wallet?.balance?.toFixed(2) ?? "0.00"}
              </p>
            </div>
          </div>
          <p className="text-xs text-foreground-subtle">
            Network: {wallet?.network}
          </p>
        </div>

        {/* Wallet Address */}
        <div className="p-6 rounded-2xl bg-background-card border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-secondary-muted flex items-center justify-center">
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground-muted">Wallet Address</p>
              <p className="text-sm font-mono text-foreground truncate">
                {wallet?.address}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {wallet?.verified && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-success-muted text-success rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Verified
              </span>
            )}
            <span className="px-2 py-1 text-xs font-medium bg-info-muted text-info rounded-full capitalize">
              {wallet?.provider}
            </span>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground mb-4">
          Transaction History
        </h2>

        {wallet?.transactions && wallet.transactions.length > 0 ? (
          <div className="rounded-2xl bg-background-card border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {wallet.transactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-background-card-hover transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tx.type === "credit" ? "bg-success-muted" : "bg-warning-muted"
                    }`}>
                      {tx.type === "credit" ? (
                        <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{tx.description}</p>
                      <p className="text-sm text-foreground-muted">
                        {new Date(tx.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${
                      tx.type === "credit" ? "text-success" : "text-foreground"
                    }`}>
                      {tx.type === "credit" ? "+" : "-"}${tx.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-foreground-subtle capitalize">{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-background-card border border-border p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">No transactions yet</h3>
            <p className="text-foreground-muted">
              Your transaction history will appear here after you run jobs
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
