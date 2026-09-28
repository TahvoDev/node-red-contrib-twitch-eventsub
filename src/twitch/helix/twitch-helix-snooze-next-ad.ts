import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSnoozeNextAdNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:ads']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const result = await apiClient.asUser(broadcasterId, (ctx: any) =>
        ctx.channels.snoozeNextAd(broadcasterId)
      );

      return {
        broadcasterId,
        snoozeCount: result.snoozeCount,
        snoozeRefreshDate: result.snoozeRefreshDate,
        nextAdDate: result.nextAdDate,
      };
    });
  }

  (TwitchHelixSnoozeNextAdNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-snooze-next-ad', TwitchHelixSnoozeNextAdNode as any);
};
