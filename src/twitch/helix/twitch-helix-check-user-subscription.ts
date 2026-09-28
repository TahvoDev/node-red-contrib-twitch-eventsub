import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixCheckUserSubscriptionNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['user:read:subscriptions']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const userValue = firstDefined(
        msg.user,
        msg.userId,
        typeof msg.payload === 'string' ? msg.payload : undefined,
        nodeConfig.user,
        authId
      );
      if (!toStr(userValue)) {
        throw new Error('A user is required — set msg.user or the node user');
      }
      const userId = await resolveUserId(apiClient, userValue);

      const subscription = await apiClient.asUser(authId, (ctx: any) =>
        ctx.subscriptions.checkUserSubscription(userId, broadcasterId)
      );
      if (!subscription) return null;

      return {
        userId,
        broadcasterId: subscription.broadcasterId,
        broadcasterName: subscription.broadcasterName,
        broadcasterDisplayName: subscription.broadcasterDisplayName,
        isGift: subscription.isGift,
        tier: subscription.tier,
      };
    });
  }

  (TwitchHelixCheckUserSubscriptionNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-check-user-subscription', TwitchHelixCheckUserSubscriptionNode as any);
};
