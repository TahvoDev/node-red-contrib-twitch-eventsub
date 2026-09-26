import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, sendChatMessage, type ChatNodeConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatSendNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg, _send, done) => {
      sendChatMessage(node, connection, config, msg, done);
    });
  }

  RED.nodes.registerType('twitch-chat-send', TwitchChatSendNode as any);
};
