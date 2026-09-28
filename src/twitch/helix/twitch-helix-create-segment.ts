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
  function TwitchHelixCreateSegmentNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:schedule']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const startDate = toStr(firstDefined(msg.startDate, msg.startTime, nodeConfig.startDate));
      if (!startDate) {
        throw new Error('startDate is required — UTC date, e.g. 2026-01-01T18:00:00Z');
      }
      const timezone = toStr(firstDefined(msg.timezone, nodeConfig.timezone));
      if (!timezone) {
        throw new Error('timezone is required — e.g. America/New_York');
      }

      const data: any = { startDate, timezone };
      data.isRecurring = toBool(firstDefined(msg.isRecurring, nodeConfig.isRecurring), false) === true;

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

      const segment = await apiClient.asUser(authId, (ctx: any) =>
        ctx.schedule.createScheduleSegment(broadcasterId, data)
      );

      return mapSegment(segment);
    });
  }

  (TwitchHelixCreateSegmentNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-segment', TwitchHelixCreateSegmentNode as any);
};
