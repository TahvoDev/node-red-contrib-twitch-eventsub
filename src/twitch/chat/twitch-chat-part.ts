import type { Node, NodeAPI } from 'node-red';
import { getChatConnection, normalizeChannel, type ChatNodeConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatPartNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', async (msg, _send, done) => {
      try {
        const client = await connection.initChat();
        if (!client) {
          node.error('Twitch chat connection is not ready', msg);
          done();
          return;
        }

        const channel = normalizeChannel(msg.channel ?? config.channel);
        if (!channel) {
          node.error('No channel specified', msg);
          done();
          return;
        }

        client.part(channel);
        node.status({});
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
        node.error(err, msg);
        done(err as Error);
      }
    });
  }

  RED.nodes.registerType('twitch-chat-part', TwitchChatPartNode as any);
};
