import type { Node, NodeAPI } from 'node-red';
import {
  getChatConnection,
  messageText,
  resolveAnnounceColor,
  runChatAction,
  sanitizeChatText,
  type ChatNodeConfig,
} from './twitch-chat-base';
import { redactError } from '../twitch-shared';

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
          // Twitch also caps announcements at 500 characters, so apply the same
          // strip-and-cap as an IRC send rather than letting a long or control-
          // character message surface as an opaque Helix 400.
          const message = sanitizeChatText(messageText(msg));
          if (!message.trim()) throw new Error('No announcement text — set msg.payload or msg.text to a string');

          await ctx.chat.sendAnnouncement(broadcasterId, {
            message,
            color: resolveAnnounceColor(msg),
          });
        });
        done();
      } catch (err) {
        done(redactError(err) as Error);
      }
    });
  }

  RED.nodes.registerType('twitch-chat-announce', TwitchChatAnnounceNode as any);
};
