import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, runChatAction, type ChatNodeConfig } from './twitch-chat-base';
import { redactError } from '../twitch-shared';

module.exports = function (RED: NodeAPI) {
  function TwitchChatClearNode(this: Node, config: ChatNodeConfig) {
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
          // Omitting the message ID clears the whole chat.
          await ctx.moderation.deleteChatMessages(broadcasterId);
        });
        done();
      } catch (err) {
        done(redactError(err) as Error);
      }
    });
  }

  RED.nodes.registerType('twitch-chat-clear', TwitchChatClearNode as any);
};
