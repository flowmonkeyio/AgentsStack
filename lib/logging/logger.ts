import { randomUUID } from "crypto";
import { RequestContext, LogLevel } from "./types";

/**
 * Generate a new trace ID (random string)
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Create a new request context with a fresh trace ID
 */
export function createContext(): RequestContext {
  return { trace_id: generateTraceId() };
}

/**
 * Logger class with structured key=value logging
 *
 * Usage:
 *   const logger = new Logger("galileo");
 *   logger.info(ctx, "operation=verify score=0.95 status=pass");
 */
export class Logger {
  private module: string;
  private minLevel: LogLevel;

  constructor(module: string) {
    this.module = module;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(ctx: RequestContext, level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} level=${level} trace_id=${ctx.trace_id} module=${this.module} ${message}`;
  }

  debug(ctx: RequestContext, message: string): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format(ctx, "debug", message));
    }
  }

  info(ctx: RequestContext, message: string): void {
    if (this.shouldLog("info")) {
      console.info(this.format(ctx, "info", message));
    }
  }

  warn(ctx: RequestContext, message: string, error?: Error): void {
    if (this.shouldLog("warn")) {
      const errorPart = error ? ` error="${error.message}"` : "";
      console.warn(this.format(ctx, "warn", message + errorPart));
    }
  }

  error(ctx: RequestContext, message: string, error?: Error): void {
    if (this.shouldLog("error")) {
      const errorPart = error ? ` error="${error.message}"` : "";
      console.error(this.format(ctx, "error", message + errorPart));
    }
  }

  /**
   * Log with explicit key=value pairs
   */
  log(ctx: RequestContext, level: LogLevel, pairs: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const message = Object.entries(pairs)
      .map(([key, value]) => {
        if (typeof value === "string" && value.includes(" ")) {
          return `${key}="${value}"`;
        }
        return `${key}=${value}`;
      })
      .join(" ");

    const formatted = this.format(ctx, level, message);

    switch (level) {
      case "debug": console.debug(formatted); break;
      case "info": console.info(formatted); break;
      case "warn": console.warn(formatted); break;
      case "error": console.error(formatted); break;
    }
  }
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}
