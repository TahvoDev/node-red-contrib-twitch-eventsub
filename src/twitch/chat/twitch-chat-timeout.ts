import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, resolveUserId, runChatAction, type ChatNodeConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatTimeoutNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        const duration = Number(msg.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error('msg.duration (seconds) is required for twitch-chat-timeout');
        }

        const userId = await resolveUserId(ctx, msg.targetUser ?? msg.user);
        await ctx.moderation.banUser(broadcasterId, {
          user: userId,
          duration,
          reason: msg.reason ? String(msg.reason) : '',
        });
      });
    });
  }

  RED.nodes.registerType('twitch-chat-timeout', TwitchChatTimeoutNode as any);
};
