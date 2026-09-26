import type { NodeAPI } from 'node-red';
import { getChatConnection, resolveUserId, runChatAction } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatUnbanNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg: any) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        const userId = await resolveUserId(ctx, msg.user);
        await ctx.moderation.unbanUser(broadcasterId, userId);
      });
    });
  }

  (TwitchChatUnbanNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-unban', TwitchChatUnbanNode as any);
};
