import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toIdList,
  toInt,
} from './twitch-helix-utils';

function imageUrl(reward: any, scale: number): string | null {
  try {
    return typeof reward.getImageUrl === 'function' ? reward.getImageUrl(scale) : null;
  } catch {
    return null;
  }
}

function mapReward(reward: any) {
  return {
    id: reward.id,
    broadcasterId: reward.broadcasterId,
    broadcasterName: reward.broadcasterName,
    broadcasterDisplayName: reward.broadcasterDisplayName,
    backgroundColor: reward.backgroundColor,
    isEnabled: reward.isEnabled,
    cost: reward.cost,
    title: reward.title,
    prompt: reward.prompt,
    userInputRequired: reward.userInputRequired,
    maxRedemptionsPerStream: reward.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: reward.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: reward.globalCooldown ?? null,
    isPaused: reward.isPaused,
    isInStock: reward.isInStock,
    redemptionsThisStream: reward.redemptionsThisStream ?? null,
    autoFulfill: reward.autoFulfill,
    cooldownExpiryDate: reward.cooldownExpiryDate ?? null,
    images: {
      url1x: imageUrl(reward, 1),
      url2x: imageUrl(reward, 2),
      url4x: imageUrl(reward, 4),
    },
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetCustomRewardsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:redemptions']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;

      const rewardIds = toIdList(firstDefined(msg.rewardIds, msg.ids, nodeConfig.rewardIds));
      let rewards: any[];
      if (rewardIds.length) {
        rewards = await apiClient.asUser(authId, (ctx: any) =>
          ctx.channelPoints.getCustomRewardsByIds(broadcasterId, rewardIds)
        );
      } else {
        const onlyManageable =
          toBool(firstDefined(msg.onlyManageable, nodeConfig.onlyManageable), false) === true;
        rewards = await apiClient.asUser(authId, (ctx: any) =>
          ctx.channelPoints.getCustomRewards(broadcasterId, onlyManageable)
        );
      }

      const mapped = rewards.map(mapReward);
      const out = getAll ? mapped.slice(0, maxAll) : mapped.slice(0, limit);
      return {
        payload: out,
        extra: { pagination: { cursor: null }, total: rewards.length },
      };
    });
  }

  (TwitchHelixGetCustomRewardsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-custom-rewards', TwitchHelixGetCustomRewardsNode as any);
};
