import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toStr,
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
  function TwitchHelixEndPredictionNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:predictions']);

      const predictionId = toStr(
        firstDefined(msg.predictionId, msg.id, nodeConfig.predictionId)
      );
      if (!predictionId) {
        throw new Error('A prediction ID is required — set msg.predictionId or the node field');
      }

      const action = (toStr(firstDefined(msg.result, msg.action, nodeConfig.result)) ?? 'resolve').toLowerCase();
      if (action !== 'resolve' && action !== 'cancel') {
        throw new Error('Prediction result must be either "resolve" or "cancel"');
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      if (action === 'cancel') {
        const canceled = await apiClient.asUser(authId, (ctx: any) =>
          ctx.predictions.cancelPrediction(broadcasterId, predictionId)
        );
        return mapPrediction(canceled);
      }

      let outcomeId = toStr(firstDefined(msg.outcome, msg.outcomeId, nodeConfig.outcome));
      if (!outcomeId) {
        throw new Error('An outcome is required to resolve a prediction — set the winning outcome');
      }

      if (!/^\d+$/.test(outcomeId)) {
        const wanted = outcomeId.toLowerCase();
        const prediction = await apiClient.asUser(authId, (ctx: any) =>
          ctx.predictions.getPredictionById(broadcasterId, predictionId)
        );
        if (!prediction) throw new Error(`Prediction "${predictionId}" could not be found`);
        const match = (prediction.outcomes ?? []).find(
          (outcome: any) => outcome.id === outcomeId || String(outcome.title).toLowerCase() === wanted
        );
        if (!match) throw new Error(`Outcome "${outcomeId}" was not found on that prediction`);
        outcomeId = match.id;
      }

      const resolved = await apiClient.asUser(authId, (ctx: any) =>
        ctx.predictions.resolvePrediction(broadcasterId, predictionId, outcomeId)
      );
      return mapPrediction(resolved);
    });
  }

  (TwitchHelixEndPredictionNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-end-prediction', TwitchHelixEndPredictionNode as any);
};
