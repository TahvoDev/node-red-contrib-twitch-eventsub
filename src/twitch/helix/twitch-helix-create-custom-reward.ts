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
  function TwitchHelixCreateCustomRewardNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:redemptions']);

      const title = toStr(
        firstDefined(
          msg.title,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.rewardTitle,
          nodeConfig.title
        )
      );
      if (!title) throw new Error('A reward title is required — set msg.payload or the node title');

      const cost = toInt(firstDefined(msg.cost, nodeConfig.cost));
      if (cost === undefined || cost < 1) {
        throw new Error('A reward cost is required — set a positive number of channel points');
      }

      const data: any = { title, cost };

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

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const reward = await apiClient.asUser(authId, (ctx: any) =>
        ctx.channelPoints.createCustomReward(broadcasterId, data)
      );

      return mapReward(reward);
    });
  }

  (TwitchHelixCreateCustomRewardNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-custom-reward', TwitchHelixCreateCustomRewardNode as any);
};
