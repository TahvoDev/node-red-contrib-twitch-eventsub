import type { Node, NodeAPI } from 'node-red';
import type { ChatClient } from '@twurple/chat';
import { getChatConnection, normalizeChannel, type ChatInConfig } from './twitch-chat-base';
import { sanitizeInbound } from '../twitch-shared';

/**
 * Builds the Node-RED message for one chat message. Pure so the plain-output
 * test can exercise it: every Twitch-sourced string is normalised by the caller,
 * and `_raw` (the whole Twurple message) is deliberately not emitted.
 */
function buildChatMessage(channel: string, text: string, message: any): Record<string, unknown> {
  const userInfo = message.userInfo;
  return {
    topic: `twitch/chat/${channel}/${userInfo.userName}`,
    channel,
    user: userInfo.userName,
    displayName: userInfo.displayName,
    userId: userInfo.userId,
    payload: text,
    id: message.id,
    emotes: Array.from(message.emoteOffsets, ([name, positions]) => ({ name, positions })),
    bits: message.bits ?? 0,
    isCheer: message.isCheer,
    isMod: userInfo.isMod,
    isSubscriber: userInfo.isSubscriber,
    isVip: userInfo.isVip,
    isBroadcaster: userInfo.isBroadcaster,
    color: userInfo.color,
    badges: Array.from(userInfo.badges, ([name, version]) => ({ name, version })),
    timestamp: new Date(),
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchChatInNode(this: Node, config: ChatInConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    const channelFilter = normalizeChannel(config.channel);
    const ignoreOwnMessages = config.ignoreOwnMessages === true;
    let listener: { unbind(): void } | undefined;

    // Rebind whenever the connection builds a client, so a client created after
    // the account logs in still reaches this node. The previous listener is
    // dropped first in case one was already bound.
    const bindClient = (client: ChatClient) => {
      listener?.unbind();
      listener = client.onMessage((channel, _user, text, message) => {
        if (channelFilter && channelFilter !== channel.toLowerCase()) return;

        const userInfo = message.userInfo;
        if (ignoreOwnMessages && userInfo.userId === connection.getUserId()) return;

        node.send(sanitizeInbound(buildChatMessage(channel, text, message)) as any);
      });
    };

    connection.addListener(node.id, node, bindClient);

    node.on('close', (done) => {
      listener?.unbind();
      connection.removeListener(node.id);
      node.status({});
      done();
    });
  }

  RED.nodes.registerType('twitch-chat-in', TwitchChatInNode as any);
};

// Exposed for the plain-output test; the Node-RED loader only calls the
// module function itself.
(module.exports as any).buildChatMessage = buildChatMessage;
