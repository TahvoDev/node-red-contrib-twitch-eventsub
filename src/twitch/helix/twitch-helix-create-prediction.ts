import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toInt,
  toStr,
} from './twitch-helix-utils';

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) {
      const s = toStr(entry);
      if (s) out.push(s);
    }
    return out;
  }
  const text = toStr(value);
  if (!text) return [];
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

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
  function TwitchHelixCreatePredictionNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:predictions']);

      const title = toStr(
        firstDefined(
          msg.title,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.predictionTitle,
          nodeConfig.title
        )
      );
      if (!title) throw new Error('A prediction title is required — set msg.payload or the node title');

      const outcomes = toStringList(firstDefined(msg.outcomes, msg.options, nodeConfig.outcomes));
      if (outcomes.length < 2 || outcomes.length > 10) {
        throw new Error('A prediction needs 2 to 10 outcomes — set msg.outcomes or the node field');
      }

      const autoLockAfter = toInt(firstDefined(msg.autoLockAfter, msg.duration, nodeConfig.autoLockAfter));
      if (autoLockAfter === undefined || autoLockAfter < 1 || autoLockAfter > 1800) {
        throw new Error('An auto-lock time of 1 to 1800 seconds is required');
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const prediction = await apiClient.asUser(authId, (ctx: any) =>
        ctx.predictions.createPrediction(broadcasterId, { title, outcomes, autoLockAfter })
      );

      return mapPrediction(prediction);
    });
  }

  (TwitchHelixCreatePredictionNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-prediction', TwitchHelixCreatePredictionNode as any);
};
