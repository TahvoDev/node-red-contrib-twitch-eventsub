import type { Node, NodeAPI } from 'node-red';
import {
  getChatConnection,
  resolveUserId,
  runChatAction,
  type ChatNodeConfig,
} from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatBanNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        const userId = await resolveUserId(ctx, msg);
        await ctx.moderation.banUser(broadcasterId, {
          user: userId,
          reason: msg.reason ? String(msg.reason) : '',
        });
      });
    });
  }

  RED.nodes.registerType('twitch-chat-ban', TwitchChatBanNode as any);
};
