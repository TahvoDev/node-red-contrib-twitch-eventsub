import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapAutoModStatus,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixCheckAutoModStatusNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderation:read']);

      const raw = firstDefined(
        typeof msg.payload === 'string' || Array.isArray(msg.payload) ? msg.payload : undefined,
        msg.message,
        msg.text,
        nodeConfig.message
      );
      const messages = (Array.isArray(raw) ? raw : [raw])
        .map((value: unknown) => toStr(value))
        .filter((value: string | undefined): value is string => Boolean(value));
      if (!messages.length) throw new Error('A message to check is required — set msg.payload');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      const data = messages.map((text: string, index: number) => ({
        messageId: `msg-${index + 1}`,
        messageText: text,
      }));

      const result = await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.checkAutoModStatus(broadcasterId, data)
      );

      const mapped = result.map(mapAutoModStatus);
      return mapped.length === 1 ? mapped[0] : mapped;
    });
  }

  (TwitchHelixCheckAutoModStatusNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-check-automod-status', TwitchHelixCheckAutoModStatusNode as any);
};
