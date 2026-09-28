import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveUserId,
  toBool,
  toIdList,
  toInt,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetVideosNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const authId = authUserId(twitchConfig);
      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const videoIds = toIdList(firstDefined(msg.videoIds, msg.ids, msg.payload, nodeConfig.videoIds));
      if (videoIds.length) {
        const videos = await apiClient.asUser(authId, (ctx: any) => ctx.videos.getVideosByIds(videoIds));
        return {
          payload: videos.map(mapVideo),
          extra: { pagination: { cursor: null }, total: videos.length },
        };
      }

      const userValue = firstDefined(
        msg.user,
        msg.userId,
        typeof msg.payload === 'string' ? msg.payload : undefined,
        nodeConfig.user,
        nodeConfig.broadcaster,
        authId
      );
      const userId = await resolveUserId(apiClient, userValue);

      const filter: any = { limit, after };
      const type = toStr(firstDefined(msg.type, msg.videoType, nodeConfig.type));
      if (type) filter.type = type;
      const period = toStr(firstDefined(msg.period, nodeConfig.period));
      if (period) filter.period = period;
      const orderBy = toStr(firstDefined(msg.sort, msg.orderBy, nodeConfig.sort));
      if (orderBy) filter.orderBy = orderBy;
      const language = toStr(firstDefined(msg.language, nodeConfig.language));
      if (language) filter.language = language;

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(authId, (ctx: any) =>
          ctx.videos.getVideosByUser(userId, { ...filter, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapVideo),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  function mapVideo(video: any) {
    return {
      id: video.id,
      userId: video.userId,
      userName: video.userName,
      userDisplayName: video.userDisplayName,
      title: video.title,
      description: video.description,
      creationDate: video.creationDate,
      publishDate: video.publishDate,
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      isPublic: video.isPublic,
      views: video.views,
      language: video.language,
      type: video.type,
      duration: video.duration,
      durationInSeconds: video.durationInSeconds,
      streamId: video.streamId ?? null,
      mutedSegmentData: video.mutedSegmentData ?? [],
    };
  }

  (TwitchHelixGetVideosNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-videos', TwitchHelixGetVideosNode as any);
};
