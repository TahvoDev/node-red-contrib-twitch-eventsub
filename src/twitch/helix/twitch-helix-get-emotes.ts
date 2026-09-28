import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  firstDefined,
  mapEmote,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetEmotesNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      const source = (toStr(firstDefined(msg.source, nodeConfig.source)) ?? 'channel').toLowerCase();

      if (source === 'global') {
        const emotes = await apiClient.chat.getGlobalEmotes();
        return emotes.map(mapEmote);
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const emotes = await apiClient.chat.getChannelEmotes(broadcasterId);
      return emotes.map(mapEmote);
    });
  }

  (TwitchHelixGetEmotesNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-emotes', TwitchHelixGetEmotesNode as any);
};
