import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toIdList,
  toInt,
} from './twitch-helix-utils';

function mapPrediction(prediction: any) {
  return {
    id: prediction.id,
    broadcasterId: prediction.broadcasterId,
    broadcasterName: prediction.broadcasterName,
    broadcasterDisplayName: prediction.broadcasterDisplayName,
    title: prediction.title,
    status: prediction.status,
    autoLockAfter: prediction.autoLockAfter,
    creationDate: prediction.creationDate,
    endDate: prediction.endDate ?? null,
    lockDate: prediction.lockDate ?? null,
    winningOutcomeId: prediction.winningOutcomeId ?? null,
    outcomes: (prediction.outcomes ?? []).map((outcome: any) => ({
      id: outcome.id,
      title: outcome.title,
      users: outcome.users,
      totalChannelPoints: outcome.totalChannelPoints,
      color: outcome.color,
      topPredictors: (outcome.topPredictors ?? []).map((predictor: any) => ({
        userId: predictor.userId,
        userName: predictor.userName,
        userDisplayName: predictor.userDisplayName,
        channelPointsUsed: predictor.channelPointsUsed,
        channelPointsWon: predictor.channelPointsWon ?? null,
      })),
    })),
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetPredictionsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:predictions']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const predictionIds = toIdList(
        firstDefined(msg.predictionIds, msg.ids, msg.predictionId, msg.id, nodeConfig.predictionIds)
      );
      if (predictionIds.length) {
        const predictions = await apiClient.asUser(authId, (ctx: any) =>
          ctx.predictions.getPredictionsByIds(broadcasterId, predictionIds)
        );
        return {
          payload: predictions.map(mapPrediction),
          extra: { pagination: { cursor: null }, total: predictions.length },
        };
      }

      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(authId, (ctx: any) =>
          ctx.predictions.getPredictions(broadcasterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapPrediction),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetPredictionsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-predictions', TwitchHelixGetPredictionsNode as any);
};
