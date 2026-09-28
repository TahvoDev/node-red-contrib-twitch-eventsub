import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapChannel,
  requireScopes,
  resolveBroadcaster,
  resolveGameId,
  toIdList,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateChannelInfoNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:broadcast']);
      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const data: any = {};

      const title = toStr(firstDefined(msg.title, nodeConfig.title));
      if (title !== undefined) data.title = title;

      const game = firstDefined(msg.game, msg.gameId, nodeConfig.game);
      if (toStr(game) !== undefined) data.gameId = await resolveGameId(apiClient, game);

      const language = toStr(firstDefined(msg.language, nodeConfig.language));
      if (language !== undefined) data.language = language;

      const tags = toIdList(firstDefined(msg.tags, nodeConfig.tags));
      if (tags.length) data.tags = tags;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set a title, game, tags or language');
      }

      await apiClient.asUser(broadcasterId, (ctx: any) =>
        ctx.channels.updateChannelInfo(broadcasterId, data)
      );

      const channel = await apiClient.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);

      return mapChannel(channel);
    });
  }

  (TwitchHelixUpdateChannelInfoNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-update-channel-info', TwitchHelixUpdateChannelInfoNode as any);
};
