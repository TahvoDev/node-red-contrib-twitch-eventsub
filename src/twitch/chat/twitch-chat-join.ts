import type { NodeAPI } from 'node-red';
import { getChatConnection, normalizeChannel } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatJoinNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', async (msg: any, _send: any, done: any) => {
      const finish = typeof done === 'function' ? done : () => {};
      try {
        const client = await connection.initChat();
        if (!client) {
          node.error('Twitch chat connection is not ready', msg);
          finish();
          return;
        }

        const channel = normalizeChannel(msg.channel ?? config.channel);
        if (!channel) {
          node.error('No channel specified', msg);
          finish();
          return;
        }

        await client.join(channel);
        node.status({});
        finish();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
        node.error(err, msg);
        finish(err as Error);
      }
    });
  }

  (TwitchChatJoinNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-join', TwitchChatJoinNode as any);
};
