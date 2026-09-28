import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixRemoveModeratorNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:moderators']);

      const targetValue = firstDefined(msg.targetUserId, msg.targetUser, msg.user, nodeConfig.user);
      if (!targetValue) throw new Error('Target user is required — set msg.user or the node field');
      const targetId = await resolveUserId(apiClient, targetValue);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.removeModerator(broadcasterId, targetId)
      );

      return { broadcasterId, userId: targetId, removed: true };
    });
  }

  (TwitchHelixRemoveModeratorNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-remove-moderator', TwitchHelixRemoveModeratorNode as any);
};
