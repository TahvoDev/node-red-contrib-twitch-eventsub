import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { firstDefined, requireScopes, toStr } from './twitch-helix-utils';

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
    members: (team.userRelations ?? []).map((relation: any) => ({
      id: relation.id,
      name: relation.name,
      displayName: relation.displayName,
    })),
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetTeamsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const id = toStr(firstDefined(msg.teamId, nodeConfig.teamId));
      const name = toStr(firstDefined(msg.teamName, nodeConfig.teamName));
      const generic = toStr(firstDefined(msg.team, msg.payload));

      let team: any;
      if (id) {
        team = await apiClient.teams.getTeamById(id);
      } else if (name) {
        team = await apiClient.teams.getTeamByName(name);
      } else if (generic) {
        team = /^\d+$/.test(generic)
          ? await apiClient.teams.getTeamById(generic)
          : await apiClient.teams.getTeamByName(generic);
      } else {
        throw new Error('A team ID or name is required — set teamId, teamName or msg.team');
      }

      const payload = team ? [mapTeam(team)] : [];
      return {
        payload,
        extra: { pagination: { cursor: null }, total: payload.length },
      };
    });
  }

  (TwitchHelixGetTeamsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-teams', TwitchHelixGetTeamsNode as any);
};
