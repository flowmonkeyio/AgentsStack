"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/layout";

interface AssetBalance {
  asset: "ETH" | "USDC";
  symbol: string;
  balance: number;
  balanceRaw: string;
  decimals: number;
  usdValue?: number;
}

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
  network: string;
  balances: AssetBalance[];
  credits: number;
  totalUsdValue: number;
  transactions: Transaction[];
}

// Compact Wallet Setup
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

    if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      setError("Invalid address format");
      return;
    }

    setIsSubmitting(true);
    setSetupStep("syncing");

    try {
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, provider: "coinbase" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to setup wallet");
      }

      setSetupStep("complete");
      setTimeout(() => onSetupComplete(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup wallet");
      setSetupStep("input");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (setupStep === "syncing" || setupStep === "complete") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className={`w-16 h-16 rounded-xl ${setupStep === "complete" ? "bg-success-muted" : "bg-primary-muted"} flex items-center justify-center mx-auto mb-4`}>
            {setupStep === "complete" ? (
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-primary animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>
          <p className="font-medium text-foreground">
            {setupStep === "complete" ? "Connected!" : "Syncing..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground mb-2">Connect Wallet</h1>
        <p className="text-sm text-foreground-muted">Enter your Base wallet address</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x..."
            className="w-full input-field font-mono text-sm"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !walletAddress.trim()}
          className="w-full btn-primary disabled:opacity-50"
        >
          Connect
        </button>
      </form>

      <p className="mt-4 text-xs text-foreground-subtle text-center">
        Need a wallet?{" "}
        <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Get Coinbase Wallet
        </a>
      </p>
    </div>
  );
}

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
      const data = await response.json();

      if (data.needsSetup || !data.wallet?.address) {
        setNeedsSetup(true);
        setWallet(null);
        return;
      }

      setWallet(data.wallet);
      setNeedsSetup(false);
    } catch (err) {
      setError("Failed to load wallet");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  useEffect(() => {
    if (searchParams.get("setup") === "true") {
      setNeedsSetup(true);
      router.replace("/wallet", { scroll: false });
    }
  }, [searchParams, router]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-background-card rounded w-24" />
        <div className="h-20 bg-background-card rounded-xl" />
      </div>
    );
  }

  if (error && !needsSetup) {
    return (
      <div className="text-center py-12">
        <p className="text-foreground-muted mb-2">{error}</p>
        <button onClick={fetchWallet} className="text-primary text-sm hover:underline">Retry</button>
      </div>
    );
  }

  if (needsSetup) {
    return <WalletSetup onSetupComplete={fetchWallet} />;
  }

  const ethBalance = wallet?.balances.find(b => b.asset === "ETH");
  const usdcBalance = wallet?.balances.find(b => b.asset === "USDC");

  // Truncate address
  const shortAddress = wallet?.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : "";

  // Calculate total USD value
  const ethUsdValue = ethBalance?.usdValue ?? (ethBalance?.balance ?? 0) * 2500; // fallback estimate
  const usdcValue = usdcBalance?.balance ?? 0;
  const totalValue = ethUsdValue + usdcValue;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: "Wallet" }]} />

      {/* 3-Card Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Hero Wallet Card */}
        <div
          className="lg:col-span-1 relative overflow-hidden rounded-2xl p-6 animate-fade-up"
          style={{
            background: 'linear-gradient(135deg, #1a1d23 0%, #2d3340 50%, #1a1d23 100%)',
            boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Subtle gradient orbs */}
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/30 to-transparent blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-gradient-to-tr from-[#6366f1]/20 to-transparent blur-2xl" />

          {/* Content */}
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                  </svg>
                </div>
                <span className="text-white/90 font-medium text-sm">Wallet</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#059669]/20 border border-[#059669]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[#10b981] text-xs font-medium">
                  {wallet?.network === "base-sepolia" ? "Sepolia" : "Mainnet"}
                </span>
              </div>
            </div>

            {/* Total Value */}
            <div className="mb-6">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Total Balance</p>
              <p className="font-heading text-3xl font-bold text-white">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Address */}
            <div className="flex items-center gap-3">
              <code className="text-white/70 text-sm font-mono">{shortAddress}</code>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#2563eb]/20 text-[#60a5fa] rounded border border-[#2563eb]/30">
                {wallet?.provider}
              </span>
            </div>
          </div>
        </div>

        {/* ETH Balance Card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 animate-fade-up delay-100 group transition-all duration-300 hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: '0 4px 20px -4px rgba(98, 126, 234, 0.15), 0 2px 8px -2px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(98, 126, 234, 0.12)',
          }}
        >
          {/* Accent gradient */}
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br from-[#627EEA]/10 to-transparent blur-xl group-hover:from-[#627EEA]/20 transition-all duration-300" />

          <div className="relative z-10">
            {/* Icon & Label */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #627EEA 0%, #8B9FEF 100%)',
                  boxShadow: '0 4px 12px -2px rgba(98, 126, 234, 0.4)',
                }}
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1.5L4 12l8 4.5 8-4.5L12 1.5zM4 14l8 8.5 8-8.5-8 4.5L4 14z"/>
                </svg>
              </div>
              <div>
                <p className="font-heading font-semibold text-[var(--foreground)]">Ethereum</p>
                <p className="text-xs text-[var(--foreground-subtle)]">ETH</p>
              </div>
            </div>

            {/* Balance */}
            <div className="mb-2">
              <p className="font-heading text-2xl font-bold text-[var(--foreground)]">
                {ethBalance?.balance.toFixed(4) ?? "0.0000"}
                <span className="text-base font-medium text-[var(--foreground-muted)] ml-1.5">ETH</span>
              </p>
            </div>

            {/* Label */}
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[#627EEA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs font-medium text-[#627EEA]">Gas fees</span>
            </div>
          </div>
        </div>

        {/* USDC Balance Card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 animate-fade-up delay-200 group transition-all duration-300 hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f0fdfa 100%)',
            boxShadow: '0 4px 20px -4px rgba(13, 148, 136, 0.15), 0 2px 8px -2px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(13, 148, 136, 0.12)',
          }}
        >
          {/* Accent gradient */}
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br from-[#0d9488]/10 to-transparent blur-xl group-hover:from-[#0d9488]/20 transition-all duration-300" />

          <div className="relative z-10">
            {/* Icon & Label */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #2775CA 0%, #4A9BE8 100%)',
                  boxShadow: '0 4px 12px -2px rgba(39, 117, 202, 0.4)',
                }}
              >
                <span className="text-white text-lg font-bold">$</span>
              </div>
              <div>
                <p className="font-heading font-semibold text-[var(--foreground)]">USD Coin</p>
                <p className="text-xs text-[var(--foreground-subtle)]">USDC</p>
              </div>
            </div>

            {/* Balance */}
            <div className="mb-2">
              <p className="font-heading text-2xl font-bold text-[var(--foreground)]">
                ${usdcBalance?.balance.toFixed(2) ?? "0.00"}
              </p>
            </div>

            {/* Label */}
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium text-[var(--primary)]">Available for jobs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="animate-fade-up delay-300">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-semibold text-[var(--foreground)]">Recent Activity</h2>
          {wallet?.transactions && wallet.transactions.length > 0 && (
            <button className="text-xs font-medium text-[var(--primary)] hover:underline">View all</button>
          )}
        </div>
        {wallet?.transactions && wallet.transactions.length > 0 ? (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--background-card)',
              boxShadow: 'var(--shadow)',
              border: '1px solid var(--border)',
            }}
          >
            {wallet.transactions.map((tx, idx) => (
              <div
                key={tx.id}
                className={`px-5 py-4 flex items-center justify-between transition-colors hover:bg-[var(--background-card-hover)] ${
                  idx !== wallet.transactions.length - 1 ? 'border-b border-[var(--border)]' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      tx.type === "credit"
                        ? "bg-gradient-to-br from-[#059669]/10 to-[#10b981]/5"
                        : "bg-gradient-to-br from-[#d97706]/10 to-[#f59e0b]/5"
                    }`}
                    style={{
                      border: tx.type === "credit"
                        ? '1px solid rgba(5, 150, 105, 0.15)'
                        : '1px solid rgba(217, 119, 6, 0.15)'
                    }}
                  >
                    <svg
                      className={`w-4 h-4 ${tx.type === "credit" ? "text-[#059669]" : "text-[#d97706]"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={tx.type === "credit"
                          ? "M12 4v16m0-16l-4 4m4-4l4 4"
                          : "M12 20V4m0 16l-4-4m4 4l4-4"
                        }
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{tx.description}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {new Date(tx.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${
                  tx.type === "credit" ? "text-[#059669]" : "text-[var(--foreground)]"
                }`}>
                  {tx.type === "credit" ? "+" : "-"}${tx.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: 'var(--background-card)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="w-12 h-12 rounded-full bg-[var(--background-subtle)] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[var(--foreground-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-[var(--foreground-muted)]">No transactions yet</p>
            <p className="text-xs text-[var(--foreground-subtle)] mt-1">Your activity will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
