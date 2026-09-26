import type { NodeAPI } from 'node-red';
import { getChatConnection, runChatAction } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatDeleteMessageNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg: any) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        if (!msg.messageId) {
          throw new Error('msg.messageId is required for twitch-chat-delete-message');
        }
        await ctx.moderation.deleteChatMessages(broadcasterId, String(msg.messageId));
      });
    });
  }

  (TwitchChatDeleteMessageNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-delete-message', TwitchChatDeleteMessageNode as any);
};
