import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
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
  function TwitchHelixGetScheduleNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const startDate = toStr(firstDefined(msg.startDate, nodeConfig.startDate));
      const utcOffset = toInt(firstDefined(msg.utcOffset, nodeConfig.utcOffset));
      const filter: any = { limit };
      if (startDate !== undefined) filter.startDate = startDate;
      if (utcOffset !== undefined) filter.utcOffset = utcOffset;

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.schedule.getSchedule(broadcasterId, {
          ...filter,
          after: cursor ?? after,
        });
        return { data: res.data.segments ?? [], cursor: res.cursor ?? null, total: undefined };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapSegment),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetScheduleNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-schedule', TwitchHelixGetScheduleNode as any);
};
