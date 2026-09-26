import type { NodeAPI } from 'node-red';
import { getChatConnection, resolveUserId, runChatAction } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatBanNode(this: any, config: any) {
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
        await ctx.moderation.banUser(broadcasterId, {
          user: userId,
          reason: msg.reason ? String(msg.reason) : '',
        });
      });
    });
  }

  (TwitchChatBanNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-ban', TwitchChatBanNode as any);
};
