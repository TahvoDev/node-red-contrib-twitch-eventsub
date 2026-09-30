/**
 * Runtime validation and object hygiene for the boundaries where external data
 * enters a node: node config, incoming `msg.*`, Helix/EventSub payloads and HTTP
 * request bodies.
 *
 * The validator is intentionally tiny (no schema dependency): strict by default,
 * rejects unknown keys, and never copies a key it was not told about — so
 * `__proto__`, `constructor` and `prototype` cannot ride in on external data.
 */

import { SecurityError, sanitizeText } from './sanitize';

export type FieldSpec =
  | { kind: 'string'; maxLength?: number; pattern?: RegExp; optional?: boolean; default?: string }
  | { kind: 'int'; min?: number; max?: number; optional?: boolean; default?: number }
  | { kind: 'bool'; optional?: boolean; default?: boolean }
  | { kind: 'string[]'; maxLength?: number; maxItems?: number; optional?: boolean }
  | { kind: 'object'; schema: Schema; optional?: boolean };

export interface Schema {
  fields: Record<string, FieldSpec>;
  /** Default true: any key not declared in `fields` is rejected. */
  strict?: boolean;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkField(name: string, spec: FieldSpec, value: unknown, path: string): unknown {
  const where = `${path}.${name}`;
  switch (spec.kind) {
    case 'string': {
      if (typeof value !== 'string') throw new SecurityError(`${where} must be a string`);
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        throw new SecurityError(`${where} is too long (max ${spec.maxLength})`);
      }
      if (spec.pattern && !spec.pattern.test(value)) throw new SecurityError(`${where} has an invalid format`);
      return value;
    }
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new SecurityError(`${where} must be an integer`);
      }
      if (spec.min !== undefined && value < spec.min) throw new SecurityError(`${where} is below the minimum`);
      if (spec.max !== undefined && value > spec.max) throw new SecurityError(`${where} is above the maximum`);
      return value;
    }
    case 'bool': {
      if (typeof value !== 'boolean') throw new SecurityError(`${where} must be a boolean`);
      return value;
    }
    case 'string[]': {
      if (!Array.isArray(value)) throw new SecurityError(`${where} must be an array`);
      const maxItems = spec.maxItems ?? 1000;
      if (value.length > maxItems) throw new SecurityError(`${where} has too many entries`);
      return value.map((entry, index) => {
        if (typeof entry !== 'string') throw new SecurityError(`${where}[${index}] must be a string`);
        return spec.maxLength !== undefined ? entry.slice(0, spec.maxLength) : entry;
      });
    }
    case 'object': {
      return validateSchema(value, spec.schema, where);
    }
    default: {
      const exhaustive: never = spec;
      throw new SecurityError(`Unknown field kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Validates `value` against `schema` and returns a fresh object carrying only the
 * declared keys. Throws {@link SecurityError} on a missing required field, a type
 * mismatch or (when `strict`) an unknown key.
 */
export function validateSchema<T = Record<string, unknown>>(
  value: unknown,
  schema: Schema,
  path = 'value'
): T {
  if (!isPlainObject(value)) throw new SecurityError(`${path} must be an object`);

  const strict = schema.strict !== false;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new SecurityError(`${path} contains a forbidden key: ${key}`);
    if (strict && !Object.prototype.hasOwnProperty.call(schema.fields, key)) {
      throw new SecurityError(`${path} contains an unknown key: ${key}`);
    }
  }

  for (const [name, spec] of Object.entries(schema.fields)) {
    const present = Object.prototype.hasOwnProperty.call(value, name) && value[name] !== undefined;
    if (!present) {
      if (spec.optional) continue;
      if ('default' in spec && spec.default !== undefined) {
        out[name] = spec.default;
        continue;
      }
      throw new SecurityError(`${path}.${name} is required`);
    }
    out[name] = checkField(name, spec, value[name], path);
  }

  return out as T;
}

/**
 * Recursively sanitizes the strings inside a JSON-like value, leaving numbers,
 * booleans and `Date`s alone and never copying a prototype-poisoning key. Depth
 * and string length are bounded, so a hostile payload cannot blow the stack.
 * Object identity is not preserved; callers that need the original keep it raw.
 */
export function sanitizeDeep(value: unknown, max: number = 1000, depth = 0): unknown {
  if (typeof value === 'string') return sanitizeText(value, max);
  if (Array.isArray(value)) {
    if (depth > 12) return [];
    return value.map((entry) => sanitizeDeep(entry, max, depth + 1));
  }
  if (value && typeof value === 'object') {
    // A Date carries no string content and is safe to pass through; anything
    // beyond the depth limit is dropped, never returned raw (a nested object
    // would otherwise smuggle control/bidi characters past the sanitizer).
    if (value instanceof Date) return value;
    if (depth > 12) return {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = sanitizeDeep((value as Record<string, unknown>)[key], max, depth + 1);
    }
    return out;
  }
  return value;
}

/** Reads an own property only; an inherited `__proto__`/`constructor` reads as absent. */
export function safeGet<T = unknown>(source: unknown, key: string): T | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;
  return (source as Record<string, unknown>)[key] as T;
}

/**
 * Copies `extra` onto `target` one declared, own key at a time, skipping the
 * prototype-poisoning keys. Replaces `Object.assign`/spread on external data.
 */
export function safeMerge<T extends Record<string, unknown>>(
  target: T,
  extra: Record<string, unknown> | undefined | null
): T {
  if (!extra || typeof extra !== 'object') return target;
  for (const key of Object.keys(extra)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    (target as Record<string, unknown>)[key] = extra[key];
  }
  return target;
}

/**
 * IRCv3 tag parsing is not reimplemented here: the `ircv3` package that Twurple
 * uses already parses tags into a `Map` and escapes tag values, so it is
 * proto-safe. See SECURITY.md.
 */

/** The fixed origins this package is allowed to call. */
export const ALLOWED_URL_HOSTS = [
  'id.twitch.tv',
  'api.twitch.tv',
] as const;

export interface UrlPolicy {
  hosts?: readonly string[];
  pathPrefixes?: readonly string[];
  protocols?: readonly string[];
}

/**
 * Builds a URL from a fixed base plus a path and query parameters, checking the
 * host and path against an allowlist. Never assemble a URL with string `+`.
 */
export function buildUrl(
  base: string,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  policy: UrlPolicy = {}
): URL {
  const hosts = policy.hosts ?? ALLOWED_URL_HOSTS;
  const protocols = policy.protocols ?? ['https:'];
  const url = new URL(path, base);

  if (protocols.indexOf(url.protocol) === -1) {
    throw new SecurityError(`Blocked URL protocol: ${url.protocol}`);
  }
  if (hosts.indexOf(url.hostname) === -1) {
    throw new SecurityError(`Blocked URL host: ${url.hostname}`);
  }
  if (policy.pathPrefixes && !policy.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    throw new SecurityError(`Blocked URL path: ${url.pathname}`);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEYS.has(key)) {
      throw new SecurityError(`Blocked URL parameter: ${key}`);
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

/** Metadata this package attaches to every message built from external data. */
export interface TwitchEnvelope {
  /** The unmodified value, kept for flows that need the original. */
  raw?: unknown;
  /** Always true: consumers must treat `payload` as untrusted. */
  untrusted: true;
  /** Where the data came from, e.g. `chat` or `eventsub`. */
  source: string;
  receivedAt?: number;
}

/**
 * Attaches the untrusted envelope without clobbering an existing `msg.twitch`.
 * Sets `msg.twitch.raw` to the original value and `msg.twitch.untrusted = true`.
 */
export function markUntrusted(
  msg: Record<string, unknown>,
  source: string,
  raw?: unknown
): TwitchEnvelope {
  const existing = safeGet<Partial<TwitchEnvelope>>(msg, 'twitch') ?? {};
  const envelope: TwitchEnvelope = {
    ...existing,
    untrusted: true,
    source,
    receivedAt: Date.now(),
  };
  if (raw !== undefined) envelope.raw = raw;
  msg.twitch = envelope;
  return envelope;
}


