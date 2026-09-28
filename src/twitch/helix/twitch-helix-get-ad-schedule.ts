import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetAdScheduleNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:ads']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const schedule = await apiClient.asUser(broadcasterId, (ctx: any) =>
        ctx.channels.getAdSchedule(broadcasterId)
      );

      return {
        broadcasterId,
        snoozeCount: schedule.snoozeCount,
        snoozeRefreshDate: schedule.snoozeRefreshDate ?? null,
        nextAdDate: schedule.nextAdDate ?? null,
        duration: schedule.duration,
        lastAdDate: schedule.lastAdDate ?? null,
        prerollFreeTime: schedule.prerollFreeTime,
      };
    });
  }

  (TwitchHelixGetAdScheduleNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-ad-schedule', TwitchHelixGetAdScheduleNode as any);
};
