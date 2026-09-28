import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapBan,
  MAX_TIMEOUT_SECONDS,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toInt,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixBanUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:banned_users']);

      const targetValue = firstDefined(msg.targetUserId, msg.targetUser, msg.user, nodeConfig.user);
      if (!targetValue) throw new Error('Target user is required — set msg.user or the node field');
      const targetId = await resolveUserId(apiClient, targetValue);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      const durationValue = firstDefined(msg.duration, nodeConfig.duration);
      let duration: number | undefined;
      if (toStr(durationValue) !== undefined) {
        const parsed = toInt(durationValue);
        if (parsed === undefined || parsed <= 0) {
          throw new Error('Duration must be a positive number of seconds, or blank for a permanent ban');
        }
        duration = Math.min(parsed, MAX_TIMEOUT_SECONDS);
      }

      const reason = toStr(firstDefined(msg.reason, nodeConfig.reason)) ?? '';

      const result = await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.banUser(broadcasterId, { user: targetId, reason, duration })
      );

      const ban = Array.isArray(result) ? result[0] : result;
      if (!ban) throw new Error('Twitch did not confirm the ban');

      return mapBan(ban);
    });
  }

  (TwitchHelixBanUserNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-ban-user', TwitchHelixBanUserNode as any);
};
