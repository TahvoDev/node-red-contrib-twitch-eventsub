import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  mapFollowedChannel,
  requireScopes,
  resolveUserId,
  toBool,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetFollowedChannelsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['user:read:follows']);

      const userValue = firstDefined(msg.user, nodeConfig.user, authUserId(twitchConfig));
      const userId = await resolveUserId(apiClient, userValue);

      const broadcasterValue = firstDefined(msg.broadcaster, nodeConfig.broadcaster);
      const filterId = broadcasterValue ? await resolveUserId(apiClient, broadcasterValue) : undefined;

      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(userId, (ctx: any) =>
          ctx.channels.getFollowedChannels(userId, filterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapFollowedChannel),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetFollowedChannelsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-followed-channels', TwitchHelixGetFollowedChannelsNode as any);
};
