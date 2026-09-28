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
} from './twitch-helix-utils';

function mapContribution(contribution: any) {
  return {
    userId: contribution.userId,
    type: contribution.type,
    total: contribution.total,
  };
}

function mapHypeTrainEvent(event: any) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventVersion: event.eventVersion,
    id: event.id,
    broadcasterId: event.broadcasterId,
    level: event.level,
    total: event.total,
    goal: event.goal,
    startDate: event.startDate,
    expiryDate: event.expiryDate,
    cooldownDate: event.cooldownDate,
    lastContribution: mapContribution(event.lastContribution),
    topContributions: (event.topContributions ?? []).map(mapContribution),
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetHypeTrainNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:hype_train']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.hypeTrain.getHypeTrainEventsForBroadcaster(broadcasterId, {
          limit,
          after: cursor ?? after,
        });
        return { data: res.data, cursor: res.cursor ?? null, total: undefined };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapHypeTrainEvent),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetHypeTrainNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-hype-train', TwitchHelixGetHypeTrainNode as any);
};
