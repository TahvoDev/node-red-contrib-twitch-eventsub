import type { Node, NodeAPI, NodeDef, NodeMessageInFlow } from 'node-red';
import type { ChatClient } from '@twurple/chat';
import type { ApiClient, BaseApiClient } from '@twurple/api';
import type { AuthProvider } from '@twurple/auth';

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

export interface ChatConnectionConfig extends NodeDef {
  account?: string;
  channels?: string;
  isBot?: boolean;
  /** Dev/mock chat server to connect to anonymously (e.g. irc.fdgt.dev). */
  host?: string;
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
  targetUser?: string;
  displayName?: string;
  userId?: string;
  text?: string;
  id?: string;
  replyTo?: string;
  messageId?: string;
  reason?: string;
  duration?: number | string;
  color?: string;
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
  addListener(id: string, node: Node): void;
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

/**
 * A Twitch user name has to be resolved to an ID before the Helix moderation
 * endpoints will accept it. A numeric input is passed through so callers that
 * already have an ID do not pay for a lookup.
 */
export async function resolveUserId(ctx: BaseApiClient, user: unknown): Promise<string> {
  const raw = String(user ?? '').trim();
  if (!raw) throw new Error('Target user is required — set msg.targetUser or msg.user');
  if (/^\d+$/.test(raw)) return raw;

  const found = await ctx.users.getUserByName(raw);
  if (!found) throw new Error(`Twitch user "${raw}" could not be found`);
  return found.id;
}

/**
 * Sends a chat message over the shared ChatClient. The channel can be overridden
 * per message with msg.channel, and msg.replyTo threads the message.
 */
export async function sendChatMessage(
  node: Node,
  connection: ChatConnection | undefined,
  config: ChatNodeConfig,
  msg: TwitchChatMessage,
  done?: (err?: Error) => void
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

    const text = String(msg.payload ?? '');
    const replyTo = msg.replyTo ? String(msg.replyTo) : undefined;
    await client.say(channel, text, replyTo ? { replyTo } : undefined);
    node.status({});
    finish();
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
    node.error(err, msg);
    finish(err as Error);
  }
}

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

  node.status({ fill: 'blue', shape: 'dot', text: 'working...' });
  try {
    await connection.initChat();
    const api = connection.getApiClient();
    const userId = connection.getUserId();
    if (!api || !userId) {
      node.status({ fill: 'red', shape: 'ring', text: 'not connected' });
      node.error('Twitch chat connection is not ready — check the account config node', msg);
      return;
    }

    const broadcaster = await api.users.getUserByName(channel);
    if (!broadcaster) throw new Error(`Unknown Twitch channel: ${channel}`);

    await api.asUser(userId, (ctx) => handler(ctx, broadcaster.id));
    node.status({});
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
    node.error(err, msg);
  }
}
