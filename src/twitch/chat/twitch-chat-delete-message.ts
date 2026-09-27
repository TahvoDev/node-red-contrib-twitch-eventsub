import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, runChatAction, type ChatNodeConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatDeleteMessageNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        // twitch-chat-in emits the message id as msg.id.
        const messageId = msg.messageId ?? msg.id;
        if (!messageId) {
          throw new Error('msg.messageId is required for twitch-chat-delete-message');
        }
        await ctx.moderation.deleteChatMessages(broadcasterId, String(messageId));
      });
    });
  }

  RED.nodes.registerType('twitch-chat-delete-message', TwitchChatDeleteMessageNode as any);
};
