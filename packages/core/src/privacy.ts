import type { PrivacyMode } from "./types.js";

const RAW_CONTENT_KEYS = new Set([
  "prompt",
  "input",
  "output",
  "content",
  "message",
  "text",
  "email",
  "phone",
  "name",
  "address"
]);

const SECRET_KEYS = new Set([
  "password",
  "passcode",
  "secret",
  "token",
  "apiKey",
  "apikey",
  "authorization",
  "cookie"
]);

export function sanitizePayload(value: unknown, mode: PrivacyMode): unknown {
  return sanitizeValue(value, mode, undefined);
}

export function sanitizeUserId(userId: string | undefined, mode: PrivacyMode): string | undefined {
  if (!userId) return undefined;
  if (mode !== "strict") return userId;
  return `hashed_${hashString(userId)}`;
}

function sanitizeValue(value: unknown, mode: PrivacyMode, key: string | undefined): unknown {
  if (key && SECRET_KEYS.has(key)) return "[redacted]";
  if (mode !== "allow_content" && key && RAW_CONTENT_KEYS.has(key)) return "[redacted]";

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, mode, undefined));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[childKey] = sanitizeValue(childValue, mode, childKey);
    }
    return sanitized;
  }

  if (mode === "strict" && typeof value === "string" && value.length > 80) {
    return undefined;
  }

  return value;
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
