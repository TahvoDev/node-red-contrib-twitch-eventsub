/**
 * Shared helpers for the Helix nodes.
 *
 * Everything here is deliberately forgiving: a node fed a string, a number, a
 * Buffer, an array or null should coerce, fall back to its config field or fail
 * with a clear message — never throw a raw TypeError out of the node.
 */

export interface HelixPagedResult<T> {
  data: T[];
  cursor: string | null;
  total?: number;
}

/* ---------------------------------------------------------------- coercion */

/**
 * A trimmed string from a primitive, or from a Buffer as UTF-8. Objects and
 * arrays return undefined rather than leaking "[object Object]" into a request.
 */
export function toStr(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (Buffer.isBuffer(value)) {
    const s = value.toString('utf8').trim();
    return s || undefined;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    return s || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

/** A finite integer, or the fallback when the value is missing or not numeric. */
export function toInt(value: unknown, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

const TRUE_WORDS = ['true', '1', 'yes', 'y', 'on'];

/** A boolean from a boolean, a number, or the usual strings; fallback otherwise. */
export function toBool(value: unknown, fallback?: boolean): boolean | undefined {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value !== 0;
  if (typeof value === 'string') return TRUE_WORDS.indexOf(value.trim().toLowerCase()) !== -1;
  return fallback;
}

/**
 * A list of string ids from an array, a comma/whitespace separated string, a
 * single value or a Buffer. Null/undefined/empty gives an empty array.
 */
export function toIdList(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) {
      const s = toStr(entry);
      if (s) out.push(s);
    }
    return out;
  }

  const text = toStr(value);
  if (!text) return [];
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The first argument that is neither null nor undefined. Mirrors `??` in a list. */
export function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

/* --------------------------------------------------------------- identity */

/** The authenticated user id from the config node, or a clear error. */
export function authUserId(twitchConfig: any): string {
  const id = firstDefined(toStr(twitchConfig?.userId), toStr(twitchConfig?.config?.twitch_user_id));
  if (!id) {
    throw new Error('Twitch user ID not found — re-authenticate the config node');
  }
  return id;
}

/** Broadcaster ids never change; cache successful login lookups briefly. */
const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const userCache = new Map<string, { id: string; expires: number }>();

/** Exposed for tests; production flows can just let the TTL expire. */
export function clearUserCache(): void {
  userCache.clear();
}

/**
 * Resolves a username or numeric id to a Twitch user id. Numeric input is
 * returned as-is (never mistaken for a login); anything else is looked up by
 * login, with a short TTL cache so repeated messages do not re-query Twitch.
 */
export async function resolveUserId(apiClient: any, value: unknown): Promise<string> {
  const raw = toStr(value);
  if (!raw) throw new Error('A user is required — set a username or user ID');
  if (/^\d+$/.test(raw)) return raw;

  const login = raw.toLowerCase();
  const cached = userCache.get(login);
  if (cached && cached.expires > Date.now()) return cached.id;

  const user = await apiClient.users.getUserByName(login);
  if (!user) throw new Error(`Twitch user "${raw}" could not be found`);

  userCache.set(login, { id: user.id, expires: Date.now() + USER_CACHE_TTL_MS });
  return user.id;
}

/** Resolves a game/category name or id to a Twitch game id. */
export async function resolveGameId(apiClient: any, value: unknown): Promise<string> {
  const raw = toStr(value);
  if (!raw) throw new Error('A game/category name or ID is required');
  if (/^\d+$/.test(raw)) return raw;

  const game = await apiClient.games.getGameByName(raw);
  if (!game) throw new Error(`Twitch category "${raw}" could not be found`);
  return game.id;
}

/* ----------------------------------------------------------------- scopes */

/**
 * Throws when the config node's token is missing a scope a node needs, so the
 * user gets "re-authenticate" instead of an opaque 401/403 later. When the
 * provider cannot report scopes the check is skipped and the API call decides.
 */
export function requireScopes(twitchConfig: any, scopes: string[]): void {
  if (!scopes.length) return;
  const provider = twitchConfig?.getAuthProvider?.();
  if (!provider?.getCurrentScopesForUser) return;

  const userId = firstDefined(twitchConfig?.userId, twitchConfig?.config?.twitch_user_id);
  let have: string[];
  try {
    have = provider.getCurrentScopesForUser(userId) ?? [];
  } catch {
    return;
  }
  if (!Array.isArray(have) || have.length === 0) return;

  const missing = scopes.filter((scope) => have.indexOf(scope) === -1);
  if (missing.length) {
    throw new Error(`Missing scope ${missing.join(', ')} — re-authenticate the config node`);
  }
}

/* ----------------------------------------------------------------- paging */

/** Twitch caps a timeout at two weeks, in seconds. */
export const MAX_TIMEOUT_SECONDS = 1_209_600;

/** Twitch paged endpoints default to 20 and cap at 100. */
export function clampLimit(value: unknown, fallback = 20): number {
  const n = toInt(value, fallback) ?? fallback;
  if (n < 1) return 1;
  return Math.min(n, 100);
}

/** Walks every page up to `max` items and returns the cursor for the next one. */
export async function fetchAllPages<T>(
  fetchPage: (cursor?: string) => Promise<HelixPagedResult<T>>,
  max: number
): Promise<HelixPagedResult<T>> {
  const all: T[] = [];
  let cursor: string | undefined;
  let nextCursor: string | null = null;
  let total: number | undefined;

  while (all.length < max) {
    const page = await fetchPage(cursor);
    all.push(...page.data);
    if (page.total !== undefined) total = page.total;
    nextCursor = page.cursor ?? null;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return { data: all.slice(0, max), cursor: nextCursor, total };
}

/* ----------------------------------------------------------------- errors */

function parseErrorBody(body: unknown): any {
  if (typeof body !== 'string' || !body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * A short, human-readable message for a Twurple HTTP error. Twurple already
 * retries and refreshes tokens, so this only explains what the user can act on.
 */
export function helixErrorMessage(err: unknown): string {
  const status = (err as any)?.statusCode;
  if (typeof status !== 'number') {
    return (err as any)?.message ? String((err as any).message) : String(err);
  }

  const body = parseErrorBody((err as any)?.body);
  const detail = body?.message ? `: ${body.message}` : '';

  switch (status) {
    case 400:
      return `Twitch rejected the request (400)${detail}`;
    case 401:
      return 'Twitch rejected the token (401) — re-authenticate the config node';
    case 403:
      return `Twitch denied the request (403)${detail} — check scopes and moderator permission`;
    case 404:
      return `Not found on Twitch (404)${detail}`;
    case 429:
      return 'Twitch rate limit reached (429) — try again shortly';
    default:
      return `Twitch API error ${status}${detail}`;
  }
}

/** A status line is one short line; anything longer is truncated for the node. */
export function shortStatus(text: string, max = 40): string {
  const line = String(text).split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/* ---------------------------------------------------------------- mappers */

/** Plain user object, matching the shape get-users already emits. */
export function mapUser(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    profilePictureUrl: user.profilePictureUrl,
    description: user.description,
    broadcasterType: user.broadcasterType,
    creationDate: user.creationDate,
  };
}

export function mapChannel(channel: any) {
  if (!channel) return null;
  return {
    id: channel.id,
    name: channel.name,
    displayName: channel.displayName,
    gameId: channel.gameId,
    gameName: channel.gameName,
    title: channel.title,
    language: channel.language,
    delay: channel.delay,
    tags: channel.tags ?? [],
    contentClassificationLabels: channel.contentClassificationLabels ?? [],
    isBrandedContent: channel.isBrandedContent ?? false,
  };
}

export function mapChatter(chatter: any) {
  return {
    userId: chatter.userId,
    userName: chatter.userName,
    userDisplayName: chatter.userDisplayName,
  };
}

export function mapFollower(follower: any) {
  return {
    userId: follower.userId,
    userName: follower.userName,
    userDisplayName: follower.userDisplayName,
    followDate: follower.followDate,
  };
}

export function mapFollowedChannel(channel: any) {
  return {
    broadcasterId: channel.broadcasterId,
    broadcasterName: channel.broadcasterName,
    broadcasterDisplayName: channel.broadcasterDisplayName,
    followDate: channel.followDate,
  };
}

function imageUrl(getter: any, scale: number): string | null {
  try {
    return typeof getter === 'function' ? getter(scale) : null;
  } catch {
    return null;
  }
}

export function mapEmote(emote: any) {
  return {
    id: emote.id,
    name: emote.name,
    type: emote.type ?? null,
    tier: emote.tier ?? null,
    emoteSetId: emote.emoteSetId ?? null,
    images: {
      url1x: imageUrl(emote.getImageUrl?.bind(emote), 1),
      url2x: imageUrl(emote.getImageUrl?.bind(emote), 2),
      url4x: imageUrl(emote.getImageUrl?.bind(emote), 4),
    },
  };
}

export function mapBadgeVersion(version: any) {
  return {
    id: version.id,
    title: version.title,
    description: version.description,
    clickAction: version.clickAction ?? null,
    clickUrl: version.clickUrl ?? null,
    images: {
      url1x: imageUrl(version.getImageUrl?.bind(version), 1),
      url2x: imageUrl(version.getImageUrl?.bind(version), 2),
      url4x: imageUrl(version.getImageUrl?.bind(version), 4),
    },
  };
}

export function mapBadgeSet(set: any) {
  return {
    setId: set.id,
    versions: (set.versions ?? []).map(mapBadgeVersion),
  };
}

export function mapChatSettings(settings: any, privileged = false) {
  const out: any = {
    broadcasterId: settings.broadcasterId,
    slowModeEnabled: settings.slowModeEnabled,
    slowModeDelay: settings.slowModeDelay ?? null,
    followerOnlyModeEnabled: settings.followerOnlyModeEnabled,
    followerOnlyModeDelay: settings.followerOnlyModeDelay ?? null,
    subscriberOnlyModeEnabled: settings.subscriberOnlyModeEnabled,
    emoteOnlyModeEnabled: settings.emoteOnlyModeEnabled,
    uniqueChatModeEnabled: settings.uniqueChatModeEnabled,
  };
  if (privileged) {
    out.nonModeratorChatDelayEnabled = settings.nonModeratorChatDelayEnabled ?? false;
    out.nonModeratorChatDelay = settings.nonModeratorChatDelay ?? null;
  }
  return out;
}

export function mapSentMessage(message: any) {
  return {
    id: message.id,
    isSent: message.isSent,
    dropReasonCode: message.dropReasonCode ?? null,
    dropReasonMessage: message.dropReasonMessage ?? null,
  };
}

export function mapBan(ban: any) {
  return {
    userId: ban.userId,
    userName: ban.userName,
    userDisplayName: ban.userDisplayName,
    moderatorId: ban.moderatorId,
    moderatorName: ban.moderatorName,
    moderatorDisplayName: ban.moderatorDisplayName,
    reason: ban.reason ?? null,
    creationDate: ban.creationDate,
    expiryDate: ban.expiryDate ?? null,
    isPermanent: !ban.expiryDate,
  };
}

export function mapModerator(moderator: any) {
  return {
    userId: moderator.userId,
    userName: moderator.userName,
    userDisplayName: moderator.userDisplayName,
  };
}

/** A user relation (used by the VIP list): id, name, displayName. */
export function mapUserRelation(relation: any) {
  return {
    id: relation.id,
    name: relation.name,
    displayName: relation.displayName,
  };
}

export function mapWarning(warning: any) {
  return {
    broadcasterId: warning.broadcasterId,
    moderatorId: warning.moderatorId,
    userId: warning.userId,
    reason: warning.reason,
  };
}

export function mapBlockedTerm(term: any) {
  return {
    id: term.id,
    text: term.text,
    broadcasterId: term.broadcasterId,
    moderatorId: term.moderatorId,
    creationDate: term.creationDate,
    updatedDate: term.updatedDate,
    expirationDate: term.expirationDate ?? null,
  };
}

export function mapAutoModStatus(status: any) {
  return {
    messageId: status.messageId,
    isPermitted: status.isPermitted,
  };
}

const ANNOUNCEMENT_COLORS = ['primary', 'blue', 'green', 'orange', 'purple'];

/**
 * Twitch accepts only its five announcement colours, so anything else (including
 * a sender's hex chat colour) falls back to `primary` rather than failing.
 */
export function resolveAnnounceColor(msg: any, config: any): string {
  const requested = (
    toStr(firstDefined(msg.announceColor, config?.color, msg.color)) ?? 'primary'
  ).toLowerCase();
  return ANNOUNCEMENT_COLORS.indexOf(requested) !== -1 ? requested : 'primary';
}
