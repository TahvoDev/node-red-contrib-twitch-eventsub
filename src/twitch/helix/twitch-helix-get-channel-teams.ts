import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

function mapTeam(team: any) {
  return {
    id: team.id,
    name: team.name,
    displayName: team.displayName,
    backgroundImageUrl: team.backgroundImageUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    creationDate: team.creationDate,
    updateDate: team.updateDate,
    info: team.info,
    logoThumbnailUrl: team.logoThumbnailUrl,
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetChannelTeamsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const teams = await apiClient.teams.getTeamsForBroadcaster(broadcasterId);

      return {
        payload: teams.map(mapTeam),
        extra: { pagination: { cursor: null }, total: teams.length },
      };
    });
  }

  (TwitchHelixGetChannelTeamsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-channel-teams', TwitchHelixGetChannelTeamsNode as any);
};
