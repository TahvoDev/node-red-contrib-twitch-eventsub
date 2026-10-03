import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, sendChatMessage, type ChatNodeConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatReplyNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg, _send, done) => {
      // twitch-chat-command can turn threading off for its matches; when it does,
      // send a plain message so the command's default (not a reply) is honoured.
      if (msg.reply === false) {
        sendChatMessage(node, connection, config, msg, done);
        return;
      }
      // twitch-chat-in emits the message id as msg.id, so a reply can be wired
      // straight onto a chat message without a change node in between.
      const replyTo = msg.replyTo ?? msg.id;
      if (!replyTo) {
        node.error('No message to reply to — set msg.replyTo, or wire this to a message with msg.id', msg);
        done();
        return;
      }
      sendChatMessage(node, connection, config, msg, done, { replyTo: String(replyTo) });
    });
  }

  RED.nodes.registerType('twitch-chat-reply', TwitchChatReplyNode as any);
};
