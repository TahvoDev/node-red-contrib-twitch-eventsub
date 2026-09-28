import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixDeleteCustomRewardNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:redemptions']);

      const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, nodeConfig.rewardId));
      if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      await apiClient.asUser(authId, (ctx: any) =>
        ctx.channelPoints.deleteCustomReward(broadcasterId, rewardId)
      );

      return { rewardId, deleted: true };
    });
  }

  (TwitchHelixDeleteCustomRewardNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-delete-custom-reward', TwitchHelixDeleteCustomRewardNode as any);
};
