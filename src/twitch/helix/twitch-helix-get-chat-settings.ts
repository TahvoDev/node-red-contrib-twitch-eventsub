import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { authUserId, mapChatSettings, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetChatSettingsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const userId = authUserId(twitchConfig);

      const settings = await apiClient.asUser(userId, (ctx: any) =>
        ctx.chat.getSettingsPrivileged(broadcasterId)
      );

      return mapChatSettings(settings, true);
    });
  }

  (TwitchHelixGetChatSettingsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-chat-settings', TwitchHelixGetChatSettingsNode as any);
};
