import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { firstDefined, requireScopes, toStr } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetGamesNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const query = toStr(
        firstDefined(
          msg.game,
          msg.category,
          msg.query,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          nodeConfig.game
        )
      );
      if (!query) throw new Error('A game/category name or ID is required');

      const game = /^\d+$/.test(query)
        ? await apiClient.games.getGameById(query)
        : await apiClient.games.getGameByName(query);
      if (!game) throw new Error(`Twitch category "${query}" could not be found`);

      return mapGame(game);
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

  (TwitchHelixGetGamesNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-games', TwitchHelixGetGamesNode as any);
};
