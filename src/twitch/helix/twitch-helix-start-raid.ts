import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixStartRaidNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:raids']);

      const fromId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const targetValue = firstDefined(
        msg.target,
        msg.targetChannel,
        msg.to,
        typeof msg.payload === 'string' ? msg.payload : undefined,
        nodeConfig.target
      );
      const targetId = await resolveUserId(apiClient, targetValue);

      const raid = await apiClient.asUser(fromId, (ctx: any) => ctx.raids.startRaid(fromId, targetId));

      return {
        fromBroadcasterId: fromId,
        toBroadcasterId: targetId,
        creationDate: raid.creationDate,
        targetIsMature: raid.targetIsMature,
      };
    });
  }

  (TwitchHelixStartRaidNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-start-raid', TwitchHelixStartRaidNode as any);
};
