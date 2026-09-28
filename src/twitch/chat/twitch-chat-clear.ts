import type { Node, NodeAPI } from 'node-red';
import {
  assertSenderIsModerator,
  getChatConnection,
  runChatAction,
  type ChatNodeConfig,
} from './twitch-chat-base';

/** Clearing the whole channel is rate-limited to one action per channel per minute. */
const CLEAR_COOLDOWN_MS = 60 * 1000;

module.exports = function (RED: NodeAPI) {
  function TwitchChatClearNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    const lastClear = new Map<string, number>();

    node.on('input', (msg) => {
      // This node deletes every viewer's chat history, so it needs an explicit
      // opt-in on the message rather than firing on any input.
      if (msg.confirm !== true) {
        node.error('twitch-chat-clear requires msg.confirm === true', msg);
        return;
      }

      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        await assertSenderIsModerator(ctx, broadcasterId, msg);

        const now = Date.now();
        const previous = lastClear.get(broadcasterId) ?? 0;
        if (now - previous < CLEAR_COOLDOWN_MS) {
          const seconds = Math.ceil((CLEAR_COOLDOWN_MS - (now - previous)) / 1000);
          throw new Error(`twitch-chat-clear is on cooldown for ${seconds}s`);
        }
        lastClear.set(broadcasterId, now);

        // Omitting the message ID clears the whole chat.
        await ctx.moderation.deleteChatMessages(broadcasterId);
      });
    });
  }

  RED.nodes.registerType('twitch-chat-clear', TwitchChatClearNode as any);
};
