import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  firstDefined,
  mapBadgeSet,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetChatBadgesNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      const source = (toStr(firstDefined(msg.source, nodeConfig.source)) ?? 'channel').toLowerCase();

      if (source === 'global') {
        const badges = await apiClient.chat.getGlobalBadges();
        return badges.map(mapBadgeSet);
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const badges = await apiClient.chat.getChannelBadges(broadcasterId);
      return badges.map(mapBadgeSet);
    });
  }

  (TwitchHelixGetChatBadgesNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-chat-badges', TwitchHelixGetChatBadgesNode as any);
};
