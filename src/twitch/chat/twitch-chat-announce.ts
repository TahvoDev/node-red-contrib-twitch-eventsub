import type { Node, NodeAPI } from 'node-red';
import {
  getChatConnection,
  messageText,
  resolveAnnounceColor,
  runChatAction,
  type ChatNodeConfig,
} from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatAnnounceNode(this: Node, config: ChatNodeConfig) {
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
          // The builder's own announcement text goes to Twitch as-is; the Helix
          // JSON body encodes it safely. Twitch rejects an over-long message.
          const message = messageText(msg);
          if (!message.trim()) throw new Error('No announcement text — set msg.payload or msg.text to a string');

          await ctx.chat.sendAnnouncement(broadcasterId, {
            message,
            color: resolveAnnounceColor(msg),
          });
        });
        done();
      } catch (err) {
        done(err as Error);
      }
    });
  }

  RED.nodes.registerType('twitch-chat-announce', TwitchChatAnnounceNode as any);
};
