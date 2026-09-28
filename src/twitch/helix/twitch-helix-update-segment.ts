import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveGameId,
  toBool,
  toInt,
  toStr,
} from './twitch-helix-utils';

function mapSegment(segment: any) {
  return {
    id: segment.id,
    startDate: segment.startDate,
    endDate: segment.endDate,
    title: segment.title,
    cancelEndDate: segment.cancelEndDate ?? null,
    categoryId: segment.categoryId ?? null,
    categoryName: segment.categoryName ?? null,
    isRecurring: segment.isRecurring,
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateSegmentNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:schedule']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const segmentId = toStr(firstDefined(msg.segmentId, msg.id, nodeConfig.segmentId));
      if (!segmentId) {
        throw new Error('segmentId is required — the schedule segment to update');
      }

      const data: any = {};

      const startDate = toStr(firstDefined(msg.startDate, msg.startTime, nodeConfig.startDate));
      if (startDate !== undefined) data.startDate = startDate;

      const timezone = toStr(firstDefined(msg.timezone, nodeConfig.timezone));
      if (timezone !== undefined) data.timezone = timezone;

      const duration = toInt(firstDefined(msg.duration, nodeConfig.duration));
      if (duration !== undefined) data.duration = duration;

      const categoryValue = firstDefined(msg.category, msg.categoryId, nodeConfig.categoryId);
      if (toStr(categoryValue) !== undefined) {
        data.categoryId = await resolveGameId(apiClient, categoryValue);
      }

      const title = toStr(
        firstDefined(
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.title,
          nodeConfig.title
        )
      );
      if (title !== undefined) data.title = title;

      const isCanceled = toBool(firstDefined(msg.isCanceled, nodeConfig.isCanceled));
      if (isCanceled !== undefined) data.isCanceled = isCanceled;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set a startDate, timezone, duration, title or category');
      }

      const segment = await apiClient.asUser(authId, (ctx: any) =>
        ctx.schedule.updateScheduleSegment(broadcasterId, segmentId, data)
      );

      return mapSegment(segment);
    });
  }

  (TwitchHelixUpdateSegmentNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-update-segment', TwitchHelixUpdateSegmentNode as any);
};
