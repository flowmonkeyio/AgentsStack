"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-foreground-muted mt-1">
          Manage your account preferences
        </p>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Notifications */}
        <div className="rounded-2xl bg-background-card border border-border p-6">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
            Notifications
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Job notifications</p>
                <p className="text-sm text-foreground-muted">
                  Get notified when jobs complete or need attention
                </p>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  notifications ? "bg-primary" : "bg-background-subtle"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    notifications ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Email updates</p>
                <p className="text-sm text-foreground-muted">
                  Receive weekly summaries and product updates
                </p>
              </div>
              <button
                onClick={() => setEmailUpdates(!emailUpdates)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  emailUpdates ? "bg-primary" : "bg-background-subtle"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    emailUpdates ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* API Keys - Coming Soon */}
        <div className="rounded-2xl bg-background-card border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              API Keys
            </h2>
            <span className="px-2 py-1 text-xs font-medium bg-secondary-muted text-secondary rounded-full">
              Coming Soon
            </span>
          </div>
          <p className="text-foreground-muted mb-4">
            Generate API keys to integrate AgentStack into your applications.
          </p>
          <button
            disabled
            className="px-4 py-2 text-sm font-medium bg-background-subtle text-foreground-subtle rounded-lg cursor-not-allowed"
          >
            Generate API Key
          </button>
        </div>

        {/* Connected Wallets - Coming Soon */}
        <div className="rounded-2xl bg-background-card border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Connected Wallets
            </h2>
            <span className="px-2 py-1 text-xs font-medium bg-secondary-muted text-secondary rounded-full">
              Coming Soon
            </span>
          </div>
          <p className="text-foreground-muted mb-4">
            Connect external wallets like MetaMask or Coinbase Wallet for payments.
          </p>
          <button
            disabled
            className="px-4 py-2 text-sm font-medium bg-background-subtle text-foreground-subtle rounded-lg cursor-not-allowed"
          >
            Connect Wallet
          </button>
        </div>

        {/* Danger Zone */}
        <div className="rounded-2xl bg-background-card border border-destructive/20 p-6">
          <h2 className="font-heading text-lg font-semibold text-destructive mb-4">
            Danger Zone
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Delete account</p>
              <p className="text-sm text-foreground-muted">
                Permanently delete your account and all data
              </p>
            </div>
            <button className="px-4 py-2 text-sm font-medium bg-destructive-muted text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-lg transition-colors">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
