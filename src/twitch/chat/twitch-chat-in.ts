import type { NodeAPI } from 'node-red';
import { getChatConnection, normalizeChannel } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatInNode(this: any, config: any) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    const channelFilter = normalizeChannel(config.channel);
    let listener: { unbind(): void } | undefined;

    connection.addListener(node.id, node);
    connection
      .initChat()
      .then((client) => {
        if (!client) return;
        listener = client.onMessage((channel: string, _user: string, text: string, message: any) => {
          if (channelFilter && channelFilter !== channel.toLowerCase()) return;

          const userInfo = message.userInfo;
          node.send({
            topic: `twitch/chat/${channel}/${userInfo.userName}`,
            channel,
            user: userInfo.userName,
            displayName: userInfo.displayName,
            userId: userInfo.userId,
            text,
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
            _raw: message,
          });
        });
      })
      .catch((e) => node.error(e));

    node.on('close', (_removed: boolean, done: () => void) => {
      listener?.unbind();
      connection.removeListener(node.id);
      node.status({});
      done();
    });
  }

  (TwitchChatInNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-chat-in', TwitchChatInNode as any);
};
