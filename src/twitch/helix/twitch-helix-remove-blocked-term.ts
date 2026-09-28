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
  function TwitchHelixRemoveBlockedTermNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:blocked_terms']);

      const termId = toStr(firstDefined(msg.termId, msg.id, nodeConfig.termId));
      if (!termId) throw new Error('Blocked term ID is required — set msg.termId or msg.id');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.removeBlockedTerm(broadcasterId, moderatorId, termId)
      );

      return { broadcasterId, termId, removed: true };
    });
  }

  (TwitchHelixRemoveBlockedTermNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-remove-blocked-term', TwitchHelixRemoveBlockedTermNode as any);
};
