import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  toBool,
  toInt,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSearchChannelsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const query = toStr(
        firstDefined(
          msg.query,
          msg.search,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          nodeConfig.query
        )
      );
      if (!query) throw new Error('A search query is required');

      const liveOnly = toBool(firstDefined(msg.liveOnly, msg.live, nodeConfig.liveOnly), false) === true;
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.search.searchChannels(query, {
          liveOnly: liveOnly || undefined,
          limit,
          after: cursor ?? after,
        });
        return { data: res.data, cursor: res.cursor ?? null, total: undefined };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapSearchResult),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapSearchResult(result: any) {
    return {
      id: result.id,
      name: result.name,
      displayName: result.displayName,
      language: result.language,
      gameId: result.gameId,
      gameName: result.gameName,
      isLive: result.isLive,
      tags: result.tags ?? [],
      thumbnailUrl: result.thumbnailUrl,
      startDate: result.startDate ?? null,
    };
  }

  (TwitchHelixSearchChannelsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-search-channels', TwitchHelixSearchChannelsNode as any);
};
