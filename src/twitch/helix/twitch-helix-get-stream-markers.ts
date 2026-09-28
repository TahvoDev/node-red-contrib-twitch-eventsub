import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toInt,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetStreamMarkersNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['user:read:broadcast']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const videoId = toStr(
        firstDefined(
          msg.video,
          msg.videoId,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          nodeConfig.video
        )
      );
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);
      const userId = authUserId(twitchConfig);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(userId, (ctx: any) =>
          videoId
            ? ctx.streams.getStreamMarkersForVideo(broadcasterId, videoId, { limit, after: cursor ?? after })
            : ctx.streams.getStreamMarkersForUser(broadcasterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapMarker),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapMarker(marker: any) {
    return {
      id: marker.id,
      creationDate: marker.creationDate,
      description: marker.description ?? '',
      positionInSeconds: marker.positionInSeconds,
      url: marker.url ?? null,
      videoId: marker.videoId ?? null,
    };
  }

  (TwitchHelixGetStreamMarkersNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-stream-markers', TwitchHelixGetStreamMarkersNode as any);
};
