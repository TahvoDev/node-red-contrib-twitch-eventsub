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
  toInt,
  toStr,
} from './twitch-helix-utils';

const REDEMPTION_STATUSES = ['UNFULFILLED', 'FULFILLED', 'CANCELED'];

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
  function TwitchHelixGetRedemptionsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:redemptions']);

      const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, nodeConfig.rewardId));
      if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

      const status = (toStr(firstDefined(msg.status, nodeConfig.status)) ?? 'UNFULFILLED').toUpperCase();
      if (REDEMPTION_STATUSES.indexOf(status) === -1) {
        throw new Error(`Status must be one of ${REDEMPTION_STATUSES.join(', ')}`);
      }

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);
      const newestFirst = toBool(firstDefined(msg.newestFirst, nodeConfig.newestFirst));

      const fetchPage = async (cursor?: string) => {
        const filter: any = { limit, after: cursor ?? after };
        if (newestFirst !== undefined) filter.newestFirst = newestFirst;
        const res = await apiClient.asUser(authId, (ctx: any) =>
          ctx.channelPoints.getRedemptionsForBroadcaster(broadcasterId, rewardId, status, filter)
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapRedemption),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetRedemptionsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-redemptions', TwitchHelixGetRedemptionsNode as any);
};
