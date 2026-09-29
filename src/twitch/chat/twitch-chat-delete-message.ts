import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, runChatAction, type ChatNodeConfig } from './twitch-chat-base';
import { sanitizeText } from '../../security';

module.exports = function (RED: NodeAPI) {
  function TwitchChatDeleteMessageNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', async (msg, _send, done) => {
      try {
        await runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
          // twitch-chat-in emits the message id as msg.id.
          const messageId = msg.messageId ?? msg.id;
          if (!messageId) {
            throw new Error('msg.messageId is required for twitch-chat-delete-message');
          }
          await ctx.moderation.deleteChatMessages(broadcasterId, sanitizeText(messageId, 64));
        });
        done();
      } catch (err) {
        done(err as Error);
      }
    });
  }

  RED.nodes.registerType('twitch-chat-delete-message', TwitchChatDeleteMessageNode as any);
};
