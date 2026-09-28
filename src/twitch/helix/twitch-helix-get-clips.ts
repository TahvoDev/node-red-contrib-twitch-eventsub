import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveGameId,
  toBool,
  toIdList,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetClipsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const userId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const clipIds = toIdList(firstDefined(msg.clipIds, msg.ids, msg.payload, nodeConfig.clipIds));
      if (clipIds.length) {
        const clips = await apiClient.asUser(userId, (ctx: any) => ctx.clips.getClipsByIds(clipIds));
        return {
          payload: clips.map(mapClip),
          extra: { pagination: { cursor: null }, total: clips.length },
        };
      }

      const game = firstDefined(msg.game, msg.gameId, nodeConfig.game);
      let fetchPage: (cursor?: string) => Promise<{ data: any[]; cursor: string | null; total?: number }>;

      if (game) {
        const gameId = await resolveGameId(apiClient, game);
        fetchPage = async (cursor?: string) => {
          const res = await apiClient.asUser(userId, (ctx: any) =>
            ctx.clips.getClipsForGame(gameId, { limit, after: cursor ?? after })
          );
          return { data: res.data, cursor: res.cursor ?? null, total: res.total };
        };
      } else {
        const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
        fetchPage = async (cursor?: string) => {
          const res = await apiClient.asUser(userId, (ctx: any) =>
            ctx.clips.getClipsForBroadcaster(broadcasterId, { limit, after: cursor ?? after })
          );
          return { data: res.data, cursor: res.cursor ?? null, total: res.total };
        };
      }

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapClip),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapClip(clip: any) {
    return {
      id: clip.id,
      url: clip.url,
      embedUrl: clip.embedUrl,
      broadcasterId: clip.broadcasterId,
      broadcasterDisplayName: clip.broadcasterDisplayName,
      creatorId: clip.creatorId,
      creatorDisplayName: clip.creatorDisplayName,
      videoId: clip.videoId,
      gameId: clip.gameId,
      language: clip.language,
      title: clip.title,
      views: clip.views,
      createdAt: clip.creationDate,
      thumbnailUrl: clip.thumbnailUrl,
      duration: clip.duration,
      vodOffset: clip.vodOffset ?? null,
      isFeatured: clip.isFeatured,
    };
  }

  (TwitchHelixGetClipsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-clips', TwitchHelixGetClipsNode as any);
};
