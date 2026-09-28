import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  mapFollower,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toBool,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetFollowersNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:read:followers']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const filterValue = firstDefined(msg.user, nodeConfig.user);
      const filterId = filterValue ? await resolveUserId(apiClient, filterValue) : undefined;

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(moderatorId, (ctx: any) =>
          ctx.channels.getChannelFollowers(broadcasterId, filterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapFollower),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetFollowersNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-followers', TwitchHelixGetFollowersNode as any);
};
