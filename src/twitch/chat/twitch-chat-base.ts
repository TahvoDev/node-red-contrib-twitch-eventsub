import type { Node, NodeAPI, NodeDef, NodeMessageInFlow } from 'node-red';
import type { ChatClient } from '@twurple/chat';
import type { ApiClient, BaseApiClient } from '@twurple/api';
import type { AuthProvider } from '@twurple/auth';
import { MAX_TIMEOUT_SECONDS, resolveAnnounceColor } from '../twitch-shared';

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

export interface ChatCommandConfig extends NodeDef {
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

/** Twitch channel names are lowercase and never carry a leading #. */
export function normalizeChannel(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^#/, '').toLowerCase();
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

/** Twitch logins are 1-25 chars of a-z, 0-9 and underscore (logins are lowercase). */
const TWITCH_LOGIN_RE = /^[a-z0-9_]{1,25}$/;

/** Twitch chat messages are capped at 500 characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

export { MAX_TIMEOUT_SECONDS, resolveAnnounceColor };

/**
 * Resolves the moderation target to a numeric user ID. The target must be
 * explicit: `msg.targetUserId` for a known id, otherwise `msg.targetUser` for a
 * login. `msg.user` (the chat sender) is deliberately never used as a fallback,
 * so a mis-wired flow fails loudly instead of moderating the wrong account.
 */
export async function resolveUserId(ctx: BaseApiClient, msg: TwitchChatMessage): Promise<string> {
  const explicitId = String(msg.targetUserId ?? '').trim();
  if (explicitId) {
    if (!/^\d+$/.test(explicitId)) {
      throw new Error('msg.targetUserId must be a numeric Twitch user ID');
    }
    return explicitId;
  }

  const raw = String(msg.targetUser ?? '').trim().toLowerCase();
  if (!raw) throw new Error('Target user is required — set msg.targetUser or msg.targetUserId');
  if (!TWITCH_LOGIN_RE.test(raw)) {
    throw new Error('msg.targetUser must be a Twitch login: 1-25 letters, digits or underscores');
  }

  const found = await ctx.users.getUserByName(raw);
  if (!found) throw new Error(`Twitch user "${raw}" could not be found`);
  return found.id;
}

/**
 * Strips carriage returns and line feeds (which would otherwise become extra IRC
 * commands on the wire) and caps the message at Twitch's 500-character limit.
 */
export function sanitizeChatText(raw: unknown): string {
  const cleaned = String(raw ?? '').replace(/[\r\n\0]+/g, ' ');
  // Slice by code point so a cap at 500 cannot split a surrogate pair.
  return Array.from(cleaned).slice(0, MAX_CHAT_MESSAGE_LENGTH).join('');
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
  const name = String(command ?? '').trim();
  if (!name) throw new Error('twitch-chat-command requires a command name');
  return { name, trigger: `${String(prefix || '!')}${name}`.toLowerCase() };
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

    const channel = normalizeChannel(msg.channel ?? config.channel);
    if (!channel) {
      node.error('No channel specified', msg);
      finish();
      return;
    }

    // twitch-chat-in sets payload; msg.text is accepted as an input alias so a
    // message does not have to be reshaped first. Newlines are stripped and the
    // text capped before it reaches the IRC socket.
    const text = sanitizeChatText(messageText(msg));
    if (!text.trim()) {
      node.error('No message text — set msg.payload or msg.text to a string', msg);
      finish();
      return;
    }

    const replyTo = options.replyTo ? String(options.replyTo) : undefined;
    await client.say(channel, text, replyTo ? { replyTo } : undefined);
    node.status({});
    finish();
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
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
    node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
    node.error(err, msg);
  }
}
