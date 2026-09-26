import type { Node, NodeAPI } from 'node-red';
import type { HelixChatAnnouncementColor } from '@twurple/api';
import { getChatConnection, runChatAction, type ChatNodeConfig } from './twitch-chat-base';

const ANNOUNCEMENT_COLORS: HelixChatAnnouncementColor[] = [
  'primary',
  'blue',
  'green',
  'orange',
  'purple',
];

module.exports = function (RED: NodeAPI) {
  function TwitchChatAnnounceNode(this: Node, config: ChatNodeConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    if (!connection) {
      node.error('No Twitch Chat Connection node configured');
      return;
    }

    node.on('input', (msg) => {
      runChatAction(node, connection, config, msg, async (ctx, broadcasterId) => {
        const color = String(msg.color ?? 'primary').toLowerCase() as HelixChatAnnouncementColor;
        if (!ANNOUNCEMENT_COLORS.includes(color)) {
          throw new Error(
            `Invalid announcement color "${msg.color}" — use one of ${ANNOUNCEMENT_COLORS.join(', ')}`
          );
        }

        await ctx.chat.sendAnnouncement(broadcasterId, {
          message: String(msg.payload ?? ''),
          color,
        });
      });
    });
  }

  RED.nodes.registerType('twitch-chat-announce', TwitchChatAnnounceNode as any);
};
