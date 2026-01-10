"use client";

/**
 * Payment entry data structure
 */
export interface PaymentEntry {
  work_id: string;
  action: string;
  agent_name: string;
  amount: number;
  tx_hash: string;
  confirmed_at: string;
}

/**
 * Props interface for PaymentTrail component
 */
export interface PaymentTrailProps {
  payments: PaymentEntry[];
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

/**
 * Truncate transaction hash for display
 */
function truncateTxHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...`;
}

/**
 * Get blockchain explorer URL for transaction
 */
function getExplorerUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}

/**
 * PaymentTrail - Show all payments made for the job
 *
 * Each payment links to blockchain explorer (BaseScan)
 *
 * Responsive behavior:
 * - Mobile: Vertical list with action name and amount. Tap to see tx hash (links to explorer)
 * - Tablet: Table with all columns visible
 * - Desktop: Same as tablet with more spacing
 */
export function PaymentTrail({ payments }: PaymentTrailProps) {
  // Empty state
  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <p className="text-sm sm:text-base">No payments yet</p>
        <p className="text-xs sm:text-sm mt-1">
          Payments will appear here as work items are completed
        </p>
      </div>
    );
  }

  // Calculate total
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-4">
      {/* Mobile: Card list */}
      <div className="md:hidden space-y-2">
        {payments.map((payment) => (
          <div
            key={payment.work_id}
            className="border border-border rounded-lg p-3 bg-background"
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-foreground text-sm">
                {payment.action}
              </span>
              <span className="text-green-600 dark:text-green-400 font-medium">
                ${payment.amount.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {payment.agent_name}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {formatDate(payment.confirmed_at)}
              </span>
              <a
                href={getExplorerUrl(payment.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-1"
              >
                View transaction
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        ))}

        {/* Mobile total */}
        <div className="border border-border rounded-lg p-3 bg-muted/50">
          <div className="flex justify-between items-center">
            <span className="font-medium text-foreground">Total</span>
            <span className="text-green-600 dark:text-green-400 font-bold">
              ${totalAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Tablet/Desktop: Table */}
      <table className="hidden md:table w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
              Action
            </th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
              Agent
            </th>
            <th className="text-right p-3 text-sm font-medium text-muted-foreground">
              Amount
            </th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
              Transaction
            </th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
              Confirmed
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr
              key={payment.work_id}
              className="border-b border-border hover:bg-muted/30"
            >
              <td className="p-3 text-foreground">{payment.action}</td>
              <td className="p-3 text-muted-foreground">{payment.agent_name}</td>
              <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                ${payment.amount.toFixed(2)}
              </td>
              <td className="p-3">
                <a
                  href={getExplorerUrl(payment.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 hover:underline text-sm inline-flex items-center gap-1"
                >
                  {truncateTxHash(payment.tx_hash)}
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </td>
              <td className="p-3 text-sm text-muted-foreground">
                {formatDate(payment.confirmed_at)}
              </td>
            </tr>
          ))}

          {/* Total row */}
          <tr className="bg-muted/50">
            <td className="p-3 font-medium text-foreground">Total</td>
            <td className="p-3" />
            <td className="p-3 text-right text-green-600 dark:text-green-400 font-bold">
              ${totalAmount.toFixed(2)}
            </td>
            <td className="p-3" />
            <td className="p-3" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default PaymentTrail;
