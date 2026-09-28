import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  mapUserRelation,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetVipsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:vips']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(moderatorId, (ctx: any) =>
          ctx.channels.getVips(broadcasterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapUserRelation),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetVipsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-vips', TwitchHelixGetVipsNode as any);
};
