import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

function mapGoal(goal: any) {
  return {
    id: goal.id,
    broadcasterId: goal.broadcasterId,
    broadcasterName: goal.broadcasterName,
    broadcasterDisplayName: goal.broadcasterDisplayName,
    type: goal.type,
    description: goal.description,
    currentAmount: goal.currentAmount,
    targetAmount: goal.targetAmount,
    creationDate: goal.creationDate,
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetGoalsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:goals']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const goals = await apiClient.goals.getGoals(broadcasterId);

      return {
        payload: goals.map(mapGoal),
        extra: { pagination: { cursor: null }, total: goals.length },
      };
    });
  }

  (TwitchHelixGetGoalsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-goals', TwitchHelixGetGoalsNode as any);
};
