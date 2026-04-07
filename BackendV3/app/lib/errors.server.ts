import { jsonResponse } from "./http.server";

export class DependencyUnavailableError extends Error {
  code = "DEPENDENCY_UNAVAILABLE" as const;
  status = 503 as const;

  constructor(
    message = "A required dependency is temporarily unavailable.",
    public dependency?: string,
  ) {
    super(message);
    this.name = "DependencyUnavailableError";
  }
}

export class InvalidConversationError extends Error {
  code = "INVALID_CONVERSATION" as const;
  status = 404 as const;

  constructor(message = "Conversation not found for this session.") {
    super(message);
    this.name = "InvalidConversationError";
  }
}

export class BlockedUrlError extends Error {
  code = "BLOCKED_URL" as const;
  status = 400 as const;

  constructor(
    message = "The supplied URL is not allowed.",
    public url?: string,
  ) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export function toKnownErrorResponse(request: Request, error: unknown) {
  if (error instanceof DependencyUnavailableError) {
    return jsonResponse(
      request,
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof InvalidConversationError) {
    return jsonResponse(
      request,
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof BlockedUrlError) {
    return jsonResponse(
      request,
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  return null;
}
