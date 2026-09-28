import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { mapChannel, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetChannelInfoNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const channel = await apiClient.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);

      return mapChannel(channel);
    });
  }

  (TwitchHelixGetChannelInfoNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-channel-info', TwitchHelixGetChannelInfoNode as any);
};
