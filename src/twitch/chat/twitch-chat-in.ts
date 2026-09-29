import type { Node, NodeAPI } from 'node-red';
import type { ChatClient } from '@twurple/chat';
import {
  getChatConnection,
  normalizeChannel,
  type ChatInConfig,
  type TwitchChatMessage,
} from './twitch-chat-base';
import { MAX_CHAT_MESSAGE_LENGTH, markUntrusted, sanitizeText } from '../../security';

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
        // Channel, topic segments and chat text are untrusted: everything leaves
        // this node through the shared sanitizer, and the raw text is preserved
        // under msg.twitch.raw for flows that genuinely need the original.
        const safeChannel = normalizeChannel(channel);
        if (!safeChannel) return;
        if (channelFilter && channelFilter !== safeChannel) return;

        const userInfo = message.userInfo;
        if (ignoreOwnMessages && userInfo.userId === connection.getUserId()) return;

        // The free text is user-chosen and gets cleaned: the message body and
        // the display name are what a chatter actually types. The rest are
        // Twitch-assigned metadata (numeric user id, message id, hex colour,
        // login) that a chatter cannot forge, so they are passed through as-is.
        const rawText = typeof text === 'string' ? text : '';
        const safeText = sanitizeText(rawText, MAX_CHAT_MESSAGE_LENGTH);
        const safeDisplay = sanitizeText(userInfo.displayName, 64);

        const out = {
          topic: `twitch/chat/${safeChannel}/${userInfo.userName}`,
          channel: safeChannel,
          user: userInfo.userName,
          displayName: safeDisplay,
          userId: userInfo.userId,
          text: safeText,
          payload: safeText,
          id: message.id,
          emotes: Array.from(message.emoteOffsets, ([name, positions]) => ({
            name: sanitizeText(name, 64),
            positions,
          })),
          bits: message.bits ?? 0,
          isCheer: message.isCheer,
          isMod: userInfo.isMod,
          isSubscriber: userInfo.isSubscriber,
          isVip: userInfo.isVip,
          isBroadcaster: userInfo.isBroadcaster,
          color: userInfo.color,
          badges: Array.from(userInfo.badges, ([name, version]) => ({
            name: sanitizeText(name, 64),
            version: sanitizeText(version, 64),
          })),
          timestamp: new Date(),
          _raw: message,
        };
        markUntrusted(out as Record<string, unknown>, 'chat', { text: rawText });
        node.send(out as unknown as TwitchChatMessage);
      });
    };

    connection.addListener(node.id, node, bindClient);

    node.on('close', (done: () => void) => {
      listener?.unbind();
      connection.removeListener(node.id);
      node.status({});
      done();
    });
  }

  RED.nodes.registerType('twitch-chat-in', TwitchChatInNode as any);
};
