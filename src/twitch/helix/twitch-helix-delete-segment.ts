import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixDeleteSegmentNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:schedule']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const segmentId = toStr(firstDefined(msg.segmentId, msg.id, nodeConfig.segmentId));
      if (!segmentId) {
        throw new Error('segmentId is required — the schedule segment to delete');
      }

      await apiClient.asUser(authId, (ctx: any) =>
        ctx.schedule.deleteScheduleSegment(broadcasterId, segmentId)
      );

      return { segmentId, deleted: true };
    });
  }

  (TwitchHelixDeleteSegmentNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-delete-segment', TwitchHelixDeleteSegmentNode as any);
};
