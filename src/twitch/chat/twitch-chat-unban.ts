import type { Node, NodeAPI } from 'node-red';
import {
  assertSenderIsModerator,
  getChatConnection,
  resolveUserId,
  runChatAction,
  type ChatNodeConfig,
} from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatUnbanNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        await assertSenderIsModerator(ctx, broadcasterId, msg);
        const userId = await resolveUserId(ctx, msg);
        await ctx.moderation.unbanUser(broadcasterId, userId);
      });
    });
  }

  RED.nodes.registerType('twitch-chat-unban', TwitchChatUnbanNode as any);
};
