import type { IncomingMessage, ServerResponse } from "node:http";
import type { Prisma } from "@prisma/client";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function sendError(
  response: ServerResponse,
  error: unknown,
): void {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      details: error.details,
    });
    return;
  }

  console.error(error);
  sendJson(response, 500, {
    error: "Internal Server Error",
  });
}

export function requireString(
  value: unknown,
  label: string,
  options?: { allowEmpty?: boolean },
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (!options?.allowEmpty && trimmed.length === 0) {
    throw new HttpError(400, `${label} cannot be empty.`);
  }

  return trimmed;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireString(value, "Value");
}

export function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer.`);
  }

  return value;
}

export function optionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = requireString(value, "Date");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Date must be a valid ISO timestamp.");
  }

  return date;
}

export function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function ensureJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return null as unknown as Prisma.InputJsonValue;
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "object":
      if (Array.isArray(value)) {
        return value.map((item) => ensureJsonValue(item));
      }

      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (item === undefined) {
            throw new HttpError(400, "JSON values cannot contain undefined.");
          }
          return [key, ensureJsonValue(item)];
        }),
      ) as Prisma.InputJsonValue;
    default:
      throw new HttpError(400, "Value must be valid JSON.");
  }
}
