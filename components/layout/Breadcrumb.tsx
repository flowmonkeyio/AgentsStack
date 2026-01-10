"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  /** Auto-generate breadcrumbs from current path if items not provided */
  auto?: boolean;
}

const pathLabels: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  agents: "Agents",
  wallet: "Wallet",
  settings: "Settings",
};

export function Breadcrumb({ items, auto = false }: BreadcrumbProps) {
  const pathname = usePathname();

  // Auto-generate breadcrumbs from path
  const breadcrumbItems: BreadcrumbItem[] = items ?? [];

  if (auto && !items) {
    const segments = pathname.split("/").filter(Boolean);
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      // Get label from pathLabels or format segment
      let label = pathLabels[segment];
      if (!label) {
        // Check if it's an ID (starts with common prefixes)
        if (segment.startsWith("job_")) {
          label = `Job ${segment.slice(4, 12)}...`;
        } else if (segment.startsWith("agent_")) {
          label = `Agent ${segment.slice(6, 14)}...`;
        } else {
          label = segment.charAt(0).toUpperCase() + segment.slice(1);
        }
      }

      breadcrumbItems.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    });
  }

  if (breadcrumbItems.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm text-foreground-muted mb-6">
      <Link
        href="/dashboard"
        className="hover:text-primary transition-colors flex items-center gap-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
        <span className="hidden sm:inline">Home</span>
      </Link>

      {breadcrumbItems.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-foreground-subtle"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
