"use client";

import ReactMarkdown from "react-markdown";

/**
 * Image output data structure
 */
export interface ImageOutput {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Discriminated union for type-safe output content
 */
export type OutputContent =
  | { type: "text"; data: string }
  | { type: "image"; data: ImageOutput }
  | { type: "json"; data: Record<string, unknown> }
  | { type: "markdown"; data: string };

/**
 * Props interface for OutputRenderer component
 */
export interface OutputRendererProps {
  content: OutputContent;
}

/**
 * OutputRenderer - Render different output types with type-safe discriminated union
 *
 * Rendering by content.type:
 * - "text": plain text in <p> tags
 * - "image": <img> with src (base64 or URL), lazy loading
 * - "json": formatted JSON viewer with syntax highlighting
 * - "markdown": rendered markdown via react-markdown
 */
export function OutputRenderer({ content }: OutputRendererProps) {
  switch (content.type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap text-foreground text-sm sm:text-base">
          {content.data}
        </p>
      );

    case "image":
      return (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.data.url}
            alt={content.data.alt}
            width={content.data.width}
            height={content.data.height}
            loading="lazy"
            className="
              max-w-full h-auto rounded-lg
              border border-border
            "
          />
          {content.data.alt && (
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
              {content.data.alt}
            </p>
          )}
        </div>
      );

    case "json":
      return (
        <pre
          className="
            bg-muted p-3 sm:p-4 rounded-lg
            overflow-x-auto
            text-xs sm:text-sm
            border border-border
          "
        >
          <code className="text-foreground">
            {JSON.stringify(content.data, null, 2)}
          </code>
        </pre>
      );

    case "markdown":
      return (
        <div
          className="
            prose prose-sm sm:prose
            dark:prose-invert
            max-w-none
            [&_h1]:text-lg [&_h1]:sm:text-xl
            [&_h2]:text-base [&_h2]:sm:text-lg
            [&_p]:text-sm [&_p]:sm:text-base
            [&_code]:text-xs [&_code]:sm:text-sm
            [&_pre]:text-xs [&_pre]:sm:text-sm
          "
        >
          <ReactMarkdown>{content.data}</ReactMarkdown>
        </div>
      );

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = content;
      return null;
    }
  }
}

export default OutputRenderer;
