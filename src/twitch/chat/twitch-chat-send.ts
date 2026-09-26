import type { NodeAPI } from 'node-red';
import { getChatConnection, sendChatMessage } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatSendNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg: any, _send: any, done: any) => {
      sendChatMessage(node, connection, config, msg, done);
    });
  }

  (TwitchChatSendNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-send', TwitchChatSendNode as any);
};
