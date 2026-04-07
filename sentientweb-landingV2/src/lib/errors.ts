export function reportError(error: unknown, context?: string): void {
  console.error(context ? `[${context}]` : "Error", error);
  // TODO: wire up Sentry — import * as Sentry from "@sentry/nextjs"
  // Sentry.captureException(error, { extra: { context } });
}
