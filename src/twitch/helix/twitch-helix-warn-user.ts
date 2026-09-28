import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapWarning,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixWarnUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:warnings']);

      const targetValue = firstDefined(msg.targetUserId, msg.targetUser, msg.user, nodeConfig.user);
      if (!targetValue) throw new Error('Target user is required — set msg.user or the node field');
      const targetId = await resolveUserId(apiClient, targetValue);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      const reason = toStr(firstDefined(msg.reason, nodeConfig.reason)) ?? '';

      const warning = await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.warnUser(broadcasterId, targetId, reason)
      );

      return mapWarning(warning);
    });
  }

  (TwitchHelixWarnUserNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-warn-user', TwitchHelixWarnUserNode as any);
};
