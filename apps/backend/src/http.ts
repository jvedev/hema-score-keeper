export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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

export function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${label} must be an integer.`);
  }

  return value;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${label} must be a boolean.`);
  }

  return value;
}

export function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function ensureJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
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
      );
    default:
      throw new HttpError(400, "Value must be valid JSON.");
  }
}

export function parseJsonValue<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

export function stringifyJsonValue(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

export function isSqliteConstraintError(error: unknown): error is { code: string; message: string } {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && typeof (error as { code: unknown }).code === "string"
    && (error as { code: string }).code.startsWith("SQLITE_CONSTRAINT"),
  );
}
