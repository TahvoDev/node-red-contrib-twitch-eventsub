import type { Node, NodeAPI, NodeDef, NodeMessageInFlow } from 'node-red';
import type { ChatClient } from '@twurple/chat';
import type { ApiClient, BaseApiClient } from '@twurple/api';
import type { AuthProvider } from '@twurple/auth';
import { MAX_TIMEOUT_SECONDS, resolveAnnounceColor } from '../twitch-shared';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  TokenBucket,
  assertLogin,
  isLogin,
  isUserId,
  normalizeChannel,
  sanitize,
  sanitizeChatText,
  sanitizeStatus,
  sanitizeText,
  toIrcLine,
  type SafeIrcLine,
  type TwitchLogin,
} from '../../security';

export type ChatStatus = {
  fill: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
  shape: 'ring' | 'dot';
  text: string;
};

/** Config shared by every node that talks to a chat connection. */
export interface ChatNodeConfig extends NodeDef {
  connection?: string;
  channel?: string;
}

/** twitch-chat-in can optionally drop the connection's own messages. */
export interface ChatInConfig extends ChatNodeConfig {
  ignoreOwnMessages?: boolean;
}

export interface ChatConnectionConfig extends NodeDef {
  account?: string;
  channels?: string;
}

export interface ChatCommandConfig extends ChatNodeConfig {
  command?: string;
  prefix?: string;
  requireMod?: boolean;
  requireSub?: boolean;
  requireVip?: boolean;
  requireBroadcaster?: boolean;
}

/**
 * The shape the chat nodes produce and consume. It extends Node-RED's message so
 * the fields added by twitch-chat-in are type-checked instead of being `any`.
 */
export interface TwitchChatMessage extends NodeMessageInFlow {
  channel?: string;
  user?: string;
  /** Login of the user to moderate. Never inferred from msg.user. */
  targetUser?: string;
  /** Numeric id of the user to moderate. Takes priority over targetUser. */
  targetUserId?: string;
  displayName?: string;
  userId?: string;
  text?: string;
  id?: string;
  replyTo?: string;
  messageId?: string;
  reason?: string;
  duration?: number | string;
  /** The sender's Twitch chat colour, e.g. "#FF0000". Not an announcement colour. */
  color?: string;
  /** A Twitch announcement colour: primary, blue, green, orange or purple. */
  announceColor?: string;
  command?: string;
  args?: string[];
  bits?: number;
  isCheer?: boolean;
  isMod?: boolean;
  isSubscriber?: boolean;
  isVip?: boolean;
  isBroadcaster?: boolean;
  emotes?: Array<{ name: string; positions: string[] }>;
  badges?: Array<{ name: string; version: string }>;
  _raw?: unknown;
}

/**
 * The subset of the twitch-chat-connection config node that the other chat nodes
 * depend on. Keeping it narrow means a change to the config node is a compile
 * error here rather than a silent runtime break.
 */
export interface ChatConnection {
  initChat(): Promise<ChatClient | undefined>;
  getChatClient(): ChatClient | undefined;
  getApiClient(): ApiClient | undefined;
  getUserId(): string | undefined;
  /**
   * Registers a node for status updates and, when a ChatClient exists, calls
   * `onClient` with it. If the client is not ready yet — auth can complete after
   * the flow is deployed — the connection calls `onClient` as soon as it is, so
   * the listener does not have to be wired on a single early promise.
   */
  addListener(id: string, node: Node, onClient?: (client: ChatClient) => void): void;
  removeListener(id: string): void;
}

/**
 * The subset of the twitch-api-config node the chat connection reads its token
 * from.
 */
export interface ChatAccount {
  apiClient?: ApiClient;
  userId?: string;
  config: { twitch_user_id?: string };
  initAuth(): Promise<void>;
  getAuthProvider(): AuthProvider | undefined;
}

/** Splits the comma-separated channel list from the config node into names. */
export function parseChannels(raw: unknown): string[] {
  return String(raw ?? '')
    .split(',')
    .map(normalizeChannel)
    .filter(Boolean);
}

export function getChatConnection(
  RED: NodeAPI,
  config: { connection?: string }
): ChatConnection | undefined {
  if (!config.connection) return undefined;
  return (RED.nodes.getNode(config.connection) as unknown as ChatConnection) || undefined;
}

export { MAX_CHAT_MESSAGE_LENGTH, MAX_TIMEOUT_SECONDS, normalizeChannel, resolveAnnounceColor, sanitizeChatText };

/**
 * Resolves the moderation target to a numeric user ID. The target must be
 * explicit: `msg.targetUserId` for a known id, otherwise `msg.targetUser` for a
 * login. `msg.user` (the chat sender) is deliberately never used as a fallback,
 * so a mis-wired flow fails loudly instead of moderating the wrong account.
 */
export async function resolveUserId(ctx: BaseApiClient, msg: TwitchChatMessage): Promise<string> {
  const explicitId = String(msg.targetUserId ?? '').trim();
  if (explicitId) {
    if (!isUserId(explicitId)) {
      throw new Error('msg.targetUserId must be a numeric Twitch user ID');
    }
    return explicitId;
  }

  const raw = String(msg.targetUser ?? '').trim().toLowerCase();
  if (!raw) throw new Error('Target user is required — set msg.targetUser or msg.targetUserId');
  if (!isLogin(raw)) {
    throw new Error('msg.targetUser must be a Twitch login: 1-25 letters, digits or underscores');
  }

  const found = await ctx.users.getUserByName(raw);
  if (!found) throw new Error(`Twitch user "${raw}" could not be found`);
  return found.id;
}

/**
 * The chat text from `msg.payload` or `msg.text`, but only when it really is a
 * string. A non-string payload is not coerced, so an object cannot reach chat as
 * "[object Object]".
 */
export function messageText(msg: TwitchChatMessage): string {
  if (typeof msg.payload === 'string') return msg.payload;
  if (typeof msg.text === 'string') return msg.text;
  return '';
}

/** Clamps a timeout to Twitch's accepted range; anything finite above two weeks is capped. */
export function clampTimeoutDuration(raw: unknown): number {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('msg.duration (seconds) is required for twitch-chat-timeout');
  }
  return Math.min(Math.floor(seconds), MAX_TIMEOUT_SECONDS);
}

/** Builds the lower-case trigger `!command`; throws when no command is configured. */
export function buildCommandTrigger(
  prefix: unknown,
  command: unknown
): { name: string; trigger: string } {
  const name = sanitizeText(command, 64).trim();
  if (!name) throw new Error('twitch-chat-command requires a command name');
  const safePrefix = sanitizeText(prefix, 8) || '!';
  return { name, trigger: `${safePrefix}${name}`.toLowerCase() };
}

/**
 * Returns the command arguments when `text` starts with `trigger` followed by
 * whitespace or the end of the string, otherwise undefined. The trailing
 * boundary stops `!ban` matching `!banned`.
 */
export function matchCommand(text: string, trigger: string): string[] | undefined {
  const lower = text.toLowerCase();
  if (!lower.startsWith(trigger)) return undefined;

  const next = lower.charAt(trigger.length);
  if (next && !/\s/.test(next)) return undefined;

  return text
    .slice(trigger.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Optional threading for a send. Only twitch-chat-reply passes this in. */
export interface SendChatOptions {
  replyTo?: string;
}

/**
 * Outgoing chat is rate limited so a fast flow cannot flood Twitch. The bucket is
 * global, not per channel — a bot that sends to many busy channels at once would
 * need per-channel buckets; this is the conservative default.
 */
// ponytail: global bucket; split per channel if multi-channel throughput matters.
let chatSendBucket = new TokenBucket(20, 0.66);

/**
 * Reserves a send token. The token is consumed only when `tryRemove` returns
 * true, inside the loop, so concurrent callers cannot all wake from the same
 * delay and send anyway: the losers observe an empty bucket and keep waiting.
 */
export async function acquireSendSlot(): Promise<void> {
  for (;;) {
    const delay = chatSendBucket.delayMs();
    if (delay <= 0 && chatSendBucket.tryRemove()) return;
    await new Promise((resolve) => setTimeout(resolve, delay > 0 ? delay : 1));
  }
}

/** Test hook: replace the shared bucket so a test can control its state. */
export function resetChatSendBucket(capacity = 20, refillPerSecond = 0.66): void {
  chatSendBucket = new TokenBucket(capacity, refillPerSecond);
}

/**
 * Sends a chat message over the shared ChatClient. The channel can be overridden
 * per message with msg.channel. Threading is opt-in via `options.replyTo` so a
 * plain send never silently becomes a reply to whatever msg.id carries.
 */
export async function sendChatMessage(
  node: Node,
  connection: ChatConnection | undefined,
  config: ChatNodeConfig,
  msg: TwitchChatMessage,
  done?: (err?: Error) => void,
  options: SendChatOptions = {}
): Promise<void> {
  const finish = done ?? (() => {});

  if (!connection) {
    node.error('No Twitch Chat Connection node configured', msg);
    finish();
    return;
  }

  try {
    const client = await connection.initChat();
    if (!client) {
      node.status({ fill: 'red', shape: 'ring', text: 'not connected' });
      node.error('Twitch chat connection is not ready — check the account config node', msg);
      finish();
      return;
    }

    let channel: TwitchLogin;
    try {
      channel = assertLogin(normalizeChannel(msg.channel ?? config.channel));
    } catch {
      node.error('No channel specified', msg);
      finish();
      return;
    }

    // twitch-chat-in sets both text and payload; accept either so a message
    // straight off the wire does not have to be reshaped first. Every external
    // string crosses the one sanitizer: control/bidi/zero-width chars out, the
    // length capped, and a leading `/` neutralised so chat text cannot turn into
    // an IRC command. The branded types are what the IRC sink accepts.
    const text: SafeIrcLine = toIrcLine(messageText(msg));
    if (!text.trim()) {
      node.error('No message text — set msg.payload or msg.text to a string', msg);
      finish();
      return;
    }

    await acquireSendSlot();
    const replyTo = options.replyTo ? sanitize(options.replyTo, 'text', { max: 64 }) : undefined;
    await client.say(channel, text, replyTo ? { replyTo } : undefined);
    node.status({});
    finish();
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: sanitizeStatus((err as Error).message) });
    // node.error already logs and triggers a Catch node; finish() without the
    // error completes the message without reporting the same error twice.
    node.error(err, msg);
    finish();
  }
}

/**
 * Broadcaster user ids never change, so one lookup per channel is enough. The
 * map is never pruned; it only caches a channel after a successful lookup, so it
 * is bounded by the distinct channels a flow actually moderates. A flow that can
 * feed unbounded, flow-controlled channel names would need an LRU or size cap.
 */
const broadcasterIds = new Map<string, string>();

/**
 * Runs one Helix chat/moderation call against the channel and authenticated
 * account from the connection node. Twitch removed the old chat-command helpers
 * from ChatClient, so ban/timeout/delete/announce/clear go through Helix now.
 * The handler receives a user-scoped API client and the broadcaster's ID.
 */
export async function runChatAction(
  node: Node,
  connection: ChatConnection | undefined,
  config: ChatNodeConfig,
  msg: TwitchChatMessage,
  handler: (ctx: BaseApiClient, broadcasterId: string) => Promise<void>
): Promise<void> {
  if (!connection) {
    node.error('No Twitch Chat Connection node configured', msg);
    return;
  }

  const channel = normalizeChannel(msg.channel ?? config.channel);
  if (!channel) {
    node.error('No channel specified', msg);
    return;
  }

  try {
    node.status({ fill: 'blue', shape: 'dot', text: 'working...' });
    await connection.initChat();
    const api = connection.getApiClient();
    const userId = connection.getUserId();
    if (!api || !userId) {
      node.status({ fill: 'red', shape: 'ring', text: 'not connected' });
      node.error('Twitch chat connection is not ready — check the account config node', msg);
      return;
    }

    let broadcasterId = broadcasterIds.get(channel);
    if (!broadcasterId) {
      broadcasterId = (await api.users.getUserByName(channel))?.id;
      if (!broadcasterId) throw new Error(`Unknown Twitch channel: ${channel}`);
      broadcasterIds.set(channel, broadcasterId);
    }

    await api.asUser(userId, (ctx) => handler(ctx, broadcasterId));
    node.status({});
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: sanitizeStatus((err as Error).message) });
    node.error(err, msg);
  }
}

/** The role checks a chat command node can require of the message sender. */
export interface ChatRoleRequirement {
  requireBroadcaster?: boolean;
  requireMod?: boolean;
  requireSub?: boolean;
  requireVip?: boolean;
}

/**
 * Verifies the sender's role against Twitch rather than trusting the `msg.isMod`
 * / `msg.isSubscriber` / `msg.isVip` / `msg.isBroadcaster` flags, which any
 * upstream node can set. Returns false when the sender does not hold the
 * required role, when the sender id is missing, or when the API is unavailable
 * (fail closed). The checks run as the authenticated account, so the connection
 * needs the matching read scope (`moderation:read`, `channel:read:subscriptions`,
 * `channel:read:vips`).
 */
export async function verifyChatRole(
  connection: ChatConnection | undefined,
  config: ChatRoleRequirement & { channel?: string },
  msg: TwitchChatMessage
): Promise<boolean> {
  const needsCheck = config.requireBroadcaster || config.requireMod || config.requireSub || config.requireVip;
  if (!needsCheck) return true;
  if (!connection) return false;

  const channel = normalizeChannel(msg.channel ?? config.channel);
  if (!channel) return false;

  const senderId = String(msg.userId ?? '').trim();
  if (!isUserId(senderId)) return false;

  const api = connection.getApiClient();
  const authId = connection.getUserId();
  if (!api || !authId) return false;

  try {
    let broadcasterId = broadcasterIds.get(channel);
    if (!broadcasterId) {
      broadcasterId = (await api.users.getUserByName(channel))?.id;
      if (!broadcasterId) return false;
      broadcasterIds.set(channel, broadcasterId);
    }

    // The broadcaster always satisfies every role.
    if (senderId === broadcasterId) return true;
    if (config.requireBroadcaster) return false;

    if (config.requireMod) {
      const isMod = await api.asUser(authId, (ctx: any) =>
        ctx.moderation.checkUserIsModerator(broadcasterId, senderId)
      );
      if (!isMod) return false;
    }
    if (config.requireSub) {
      const sub = await api.asUser(authId, (ctx: any) =>
        ctx.subscriptions.checkUserSubscription(broadcasterId, senderId)
      );
      if (!sub) return false;
    }
    if (config.requireVip) {
      const vips = (await api.asUser(authId, (ctx: any) => ctx.channels.getVips(broadcasterId))) as any[];
      const isVip = (vips ?? []).some((vip: any) => vip.id === senderId);
      if (!isVip) return false;
    }
    return true;
  } catch {
    return false;
  }
}
