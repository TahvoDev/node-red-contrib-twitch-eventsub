import type { NodeAPI } from 'node-red';
import { getChatConnection, sendChatMessage } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatReplyNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg: any, _send: any, done: any) => {
      if (!msg.replyTo) {
        node.error('msg.replyTo is required for twitch-chat-reply', msg);
        if (typeof done === 'function') done();
        return;
      }
      sendChatMessage(node, connection, config, msg, done);
    });
  }

  (TwitchChatReplyNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-reply', TwitchChatReplyNode as any);
};
