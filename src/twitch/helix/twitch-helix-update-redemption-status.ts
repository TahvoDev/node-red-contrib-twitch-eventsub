import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toIdList,
  toStr,
} from './twitch-helix-utils';

const TARGET_STATUSES = ['FULFILLED', 'CANCELED'];

function mapRedemption(redemption: any) {
  return {
    id: redemption.id,
    broadcasterId: redemption.broadcasterId,
    broadcasterName: redemption.broadcasterName,
    broadcasterDisplayName: redemption.broadcasterDisplayName,
    userId: redemption.userId,
    userName: redemption.userName,
    userDisplayName: redemption.userDisplayName,
    userInput: redemption.userInput,
    isFulfilled: redemption.isFulfilled,
    isCanceled: redemption.isCanceled,
    redemptionDate: redemption.redemptionDate,
    rewardId: redemption.rewardId,
    rewardTitle: redemption.rewardTitle,
    rewardPrompt: redemption.rewardPrompt,
    rewardCost: redemption.rewardCost,
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateRedemptionStatusNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:redemptions']);

      const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, nodeConfig.rewardId));
      if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

      const redemptionIds = toIdList(
        firstDefined(msg.redemptionIds, msg.redemptionId, msg.id, nodeConfig.redemptionIds)
      );
      if (!redemptionIds.length) {
        throw new Error('A redemption ID is required — set msg.redemptionId or the node field');
      }

      const status = (toStr(firstDefined(msg.status, nodeConfig.status)) ?? 'FULFILLED').toUpperCase();
      if (TARGET_STATUSES.indexOf(status) === -1) {
        throw new Error('Status must be either FULFILLED or CANCELED');
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const updated = await apiClient.asUser(authId, (ctx: any) =>
        ctx.channelPoints.updateRedemptionStatusByIds(broadcasterId, rewardId, redemptionIds, status)
      );

      return updated.map(mapRedemption);
    });
  }

  (TwitchHelixUpdateRedemptionStatusNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType(
    'twitch-helix-update-redemption-status',
    TwitchHelixUpdateRedemptionStatusNode as any
  );
};
