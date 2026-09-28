import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  toBool,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetTopGamesNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.games.getTopGames({ limit, after: cursor ?? after });
        return { data: res.data, cursor: res.cursor ?? null, total: undefined };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapGame),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapGame(game: any) {
    return {
      id: game.id,
      name: game.name,
      boxArtUrl: game.boxArtUrl,
      igdbId: game.igdbId ?? null,
    };
  }

  (TwitchHelixGetTopGamesNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-top-games', TwitchHelixGetTopGamesNode as any);
};
