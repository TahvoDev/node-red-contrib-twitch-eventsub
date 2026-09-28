import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveAnnounceColor,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSendAnnouncementNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:announcements']);

      const text = toStr(
        firstDefined(
          msg.message,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.text,
          nodeConfig.message
        )
      );
      if (!text) throw new Error('Announcement text is required — set msg.payload or the node message');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);
      const color = resolveAnnounceColor(msg, nodeConfig);

      await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.chat.sendAnnouncement(broadcasterId, { message: text, color })
      );

      return { broadcasterId, message: text, color };
    });
  }

  (TwitchHelixSendAnnouncementNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-send-announcement', TwitchHelixSendAnnouncementNode as any);
};
