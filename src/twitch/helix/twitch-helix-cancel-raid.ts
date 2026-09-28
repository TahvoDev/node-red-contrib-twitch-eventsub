import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixCancelRaidNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:raids']);

      const fromId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      await apiClient.asUser(fromId, (ctx: any) => ctx.raids.cancelRaid(fromId));

      return { broadcasterId: fromId, cancelled: true };
    });
  }

  (TwitchHelixCancelRaidNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-cancel-raid', TwitchHelixCancelRaidNode as any);
};
