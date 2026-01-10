"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-foreground-muted mt-1">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
