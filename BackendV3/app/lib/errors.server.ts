import { getCorsHeaders } from "./origin.server";

interface KnownPublicErrorShape {
  code: string;
  status: number;
  publicMessage: string;
}

function isKnownPublicError(error: unknown): error is Error & KnownPublicErrorShape {
  const candidate = error as Partial<KnownPublicErrorShape> | null;
  return (
    error instanceof Error &&
    candidate !== null &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.publicMessage === "string"
  );
}

function buildKnownErrorResponse(
  request: Request,
  error: Error & KnownPublicErrorShape,
  allowOrigin = false,
) {
  const headers = new Headers(
    getCorsHeaders(request.headers.get("origin"), allowOrigin),
  );
  headers.set("Content-Type", "application/json");

  return new Response(
    JSON.stringify({ error: error.publicMessage, code: error.code }),
    {
      status: error.status,
      headers,
    },
  );
}

export class DependencyUnavailableError extends Error {
  code = "DEPENDENCY_UNAVAILABLE" as const;
  status = 503 as const;
  publicMessage: string;

  constructor(
    message = "A required dependency is temporarily unavailable.",
    public dependency?: string,
  ) {
    super(message);
    this.name = "DependencyUnavailableError";
    this.publicMessage = message;
  }
}

export class InvalidConversationError extends Error {
  code = "INVALID_CONVERSATION" as const;
  status = 404 as const;
  publicMessage: string;

  constructor(message = "Conversation not found for this session.") {
    super(message);
    this.name = "InvalidConversationError";
    this.publicMessage = message;
  }
}

export class BlockedUrlError extends Error {
  code = "BLOCKED_URL" as const;
  status = 400 as const;
  publicMessage: string;

  constructor(
    message = "The supplied URL is not allowed.",
    public url?: string,
  ) {
    super(message);
    this.name = "BlockedUrlError";
    this.publicMessage = message;
  }
}

export class RequestTooLargeError extends Error {
  code = "REQUEST_TOO_LARGE" as const;
  status = 413 as const;
  publicMessage = "Request body exceeds the maximum allowed size.";

  constructor(
    public maxBytes: number,
    message = `Request body exceeds the maximum allowed size of ${maxBytes} bytes.`,
  ) {
    super(message);
    this.name = "RequestTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  code = "INVALID_JSON" as const;
  status = 400 as const;
  publicMessage = "Request body must be valid JSON.";

  constructor(message = "Request body must be valid JSON.") {
    super(message);
    this.name = "InvalidJsonBodyError";
  }
}

export class InstallManagementAuthError extends Error {
  code = "INSTALL_AUTH_FAILED" as const;
  status = 401 as const;
  publicMessage = "Install authentication failed.";

  constructor(message = "Install management authentication failed.") {
    super(message);
    this.name = "InstallManagementAuthError";
  }
}

export class WordPressExchangeError extends Error {
  code = "WORDPRESS_EXCHANGE_FAILED" as const;
  status = 400 as const;
  publicMessage = "WordPress install exchange failed.";

  constructor(message = "WordPress install exchange failed.") {
    super(message);
    this.name = "WordPressExchangeError";
  }
}

export function toKnownErrorResponse(
  request: Request,
  error: unknown,
  allowOrigin = false,
) {
  if (isKnownPublicError(error)) {
    return buildKnownErrorResponse(request, error, allowOrigin);
  }

  return null;
}
