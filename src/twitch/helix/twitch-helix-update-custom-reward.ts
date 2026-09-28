import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toInt,
  toStr,
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
  function TwitchHelixUpdateCustomRewardNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:redemptions']);

      const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, nodeConfig.rewardId));
      if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

      const data: any = {};

      const title = toStr(
        firstDefined(
          msg.title,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.rewardTitle,
          nodeConfig.title
        )
      );
      if (title !== undefined) data.title = title;

      const costValue = firstDefined(msg.cost, nodeConfig.cost);
      if (toStr(costValue) !== undefined) {
        const cost = toInt(costValue);
        if (cost === undefined || cost < 1) {
          throw new Error('Reward cost must be a positive number of channel points');
        }
        data.cost = cost;
      }

      const prompt = toStr(firstDefined(msg.prompt, nodeConfig.prompt));
      if (prompt !== undefined) data.prompt = prompt;

      const isEnabled = toBool(firstDefined(msg.enabled, msg.isEnabled, nodeConfig.enabled));
      if (isEnabled !== undefined) data.isEnabled = isEnabled;

      const backgroundColor = toStr(firstDefined(msg.backgroundColor, nodeConfig.backgroundColor));
      if (backgroundColor !== undefined) data.backgroundColor = backgroundColor;

      const userInputRequired = toBool(firstDefined(msg.userInputRequired, nodeConfig.userInputRequired));
      if (userInputRequired !== undefined) data.userInputRequired = userInputRequired;

      const maxPerStream = toInt(firstDefined(msg.maxRedemptionsPerStream, nodeConfig.maxRedemptionsPerStream));
      if (maxPerStream !== undefined) data.maxRedemptionsPerStream = maxPerStream;

      const maxPerUser = toInt(
        firstDefined(msg.maxRedemptionsPerUserPerStream, nodeConfig.maxRedemptionsPerUserPerStream)
      );
      if (maxPerUser !== undefined) data.maxRedemptionsPerUserPerStream = maxPerUser;

      const globalCooldown = toInt(firstDefined(msg.globalCooldown, nodeConfig.globalCooldown));
      if (globalCooldown !== undefined) data.globalCooldown = globalCooldown;

      const autoFulfill = toBool(firstDefined(msg.autoFulfill, nodeConfig.autoFulfill));
      if (autoFulfill !== undefined) data.autoFulfill = autoFulfill;

      const isPaused = toBool(firstDefined(msg.paused, msg.isPaused, nodeConfig.paused));
      if (isPaused !== undefined) data.isPaused = isPaused;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set at least one reward field');
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const reward = await apiClient.asUser(authId, (ctx: any) =>
        ctx.channelPoints.updateCustomReward(broadcasterId, rewardId, data)
      );

      return mapReward(reward);
    });
  }

  (TwitchHelixUpdateCustomRewardNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-update-custom-reward', TwitchHelixUpdateCustomRewardNode as any);
};
