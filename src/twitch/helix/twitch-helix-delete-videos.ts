import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toIdList,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixDeleteVideosNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:videos']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const videoIds = toIdList(firstDefined(msg.videoIds, msg.ids, msg.payload, nodeConfig.videoIds));
      if (!videoIds.length) {
        throw new Error('A video ID is required — set msg.videoIds or the node video IDs');
      }

      await apiClient.asUser(authUserId(twitchConfig), (ctx: any) =>
        ctx.videos.deleteVideosByIds(broadcasterId, videoIds)
      );

      return { broadcasterId, deleted: videoIds, count: videoIds.length };
    });
  }

  (TwitchHelixDeleteVideosNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-delete-videos', TwitchHelixDeleteVideosNode as any);
};
