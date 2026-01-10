"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface WalletState {
  hasWallet: boolean;
  credits: number;
}

export function CreditsDisplay() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchWallet() {
      try {
        const response = await fetch("/api/wallet");
        if (response.ok) {
          const data = await response.json();
          setWallet({
            hasWallet: data.wallet?.address ? true : false,
            credits: data.wallet?.credits ?? 0,
          });
        } else if (response.status === 404) {
          // No wallet exists
          setWallet({ hasWallet: false, credits: 0 });
        }
      } catch (error) {
        console.error("Failed to fetch wallet:", error);
        setWallet({ hasWallet: false, credits: 0 });
      } finally {
        setIsLoading(false);
      }
    }

    fetchWallet();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-subtle animate-pulse">
        <div className="w-4 h-4 rounded bg-background-card" />
        <div className="w-12 h-4 rounded bg-background-card" />
      </div>
    );
  }

  // No wallet - show setup prompt
  if (!wallet?.hasWallet) {
    return (
      <Link
        href="/wallet?setup=true"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-muted hover:bg-accent/20 transition-colors group"
      >
        <svg
          className="w-4 h-4 text-accent"
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
        <span className="text-sm font-medium text-accent">
          Setup Wallet
        </span>
      </Link>
    );
  }

  // Has wallet - show credits
  return (
    <Link
      href="/wallet"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-muted hover:bg-primary/20 transition-colors group"
    >
      <svg
        className="w-4 h-4 text-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="text-sm font-semibold text-primary">
        ${wallet.credits.toFixed(2)}
      </span>
    </Link>
  );
}

export default CreditsDisplay;
