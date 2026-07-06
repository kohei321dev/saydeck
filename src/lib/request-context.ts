import { NextResponse } from "next/server";

export const requestIdHeaderName = "x-request-id";
export const correlationIdHeaderName = "x-correlation-id";

type CreateRequestContextInput = {
  operation: string;
  route: string;
};

export type RequestContext = {
  method: string;
  operation: string;
  requestId: string;
  route: string;
  startedAt: number;
};

const safeIncomingRequestIdPattern = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;

export function createRequestContext(
  request: Request,
  input: CreateRequestContextInput,
): RequestContext {
  return {
    method: request.method,
    operation: input.operation,
    requestId: getIncomingRequestId(request) || `req_${crypto.randomUUID()}`,
    route: input.route,
    startedAt: Date.now(),
  };
}

export function jsonWithRequestContext(
  body: unknown,
  init: ResponseInit | undefined,
  context: RequestContext,
): NextResponse {
  return withRequestContext(NextResponse.json(body, init), context);
}

export function withRequestContext<T extends Response>(
  response: T,
  context: RequestContext,
): T {
  response.headers.set(requestIdHeaderName, context.requestId);
  response.headers.set(correlationIdHeaderName, context.requestId);
  return response;
}

export function getRequestContextLogFields(
  context: RequestContext,
  fields?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    operation: context.operation,
    durationMs: Date.now() - context.startedAt,
    ...fields,
  };
}

function getIncomingRequestId(request: Request): string | null {
  return normalizeIncomingRequestId(
    request.headers.get(requestIdHeaderName) ||
      request.headers.get(correlationIdHeaderName),
  );
}

function normalizeIncomingRequestId(value: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed || !safeIncomingRequestIdPattern.test(trimmed)) {
    return null;
  }

  return trimmed;
}
