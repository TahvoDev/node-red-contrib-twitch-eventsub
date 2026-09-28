import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapBlockedTerm,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixAddBlockedTermNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:blocked_terms']);

      const term = toStr(
        firstDefined(
          msg.term,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.text,
          nodeConfig.term
        )
      );
      if (!term) throw new Error('Blocked term is required — set msg.payload or the node field');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      const result = await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.addBlockedTerm(broadcasterId, term)
      );

      const created = Array.isArray(result) ? result[0] : result;
      if (!created) throw new Error('Twitch did not confirm the blocked term');
      return mapBlockedTerm(created);
    });
  }

  (TwitchHelixAddBlockedTermNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-add-blocked-term', TwitchHelixAddBlockedTermNode as any);
};
