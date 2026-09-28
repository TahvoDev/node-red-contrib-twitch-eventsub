import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toBool,
  toInt,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetSubscriptionsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:subscriptions']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const userValue = firstDefined(msg.user, nodeConfig.user);
      if (toStr(userValue)) {
        const userId = await resolveUserId(apiClient, userValue);
        const subs = await apiClient.subscriptions.getSubscriptionsForUsers(broadcasterId, [userId]);
        return {
          payload: subs.map(mapSubscription),
          extra: { pagination: { cursor: null }, total: subs.length },
        };
      }

      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.subscriptions.getSubscriptions(broadcasterId, {
          limit,
          after: cursor ?? after,
        });
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapSubscription),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapSubscription(sub: any) {
    return {
      userId: sub.userId,
      userName: sub.userName,
      userDisplayName: sub.userDisplayName,
      broadcasterId: sub.broadcasterId,
      broadcasterName: sub.broadcasterName,
      broadcasterDisplayName: sub.broadcasterDisplayName,
      gifterId: sub.gifterId ?? null,
      gifterName: sub.gifterName ?? null,
      gifterDisplayName: sub.gifterDisplayName ?? null,
      isGift: sub.isGift,
      tier: sub.tier,
    };
  }

  (TwitchHelixGetSubscriptionsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-subscriptions', TwitchHelixGetSubscriptionsNode as any);
};
