import { defineHelix, type HelixField } from '../define';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  resolveGameId,
  resolveUserId,
  toBool,
  toStr,
} from '../twitch-helix-utils';

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

function mapGame(game: any) {
  return {
    id: game.id,
    name: game.name,
    boxArtUrl: game.boxArtUrl,
    igdbId: game.igdbId ?? null,
  };
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

function toPlainStream(stream: any) {
  return {
    id: stream.id,
    userId: stream.userId,
    userName: stream.userName,
    userDisplayName: stream.userDisplayName,
    gameId: stream.gameId,
    gameName: stream.gameName,
    type: stream.type,
    title: stream.title,
    viewerCount: stream.viewers,
    startedAt: stream.startDate,
    language: stream.language,
    thumbnailUrl: stream.thumbnailUrl,
    isMature: stream.isMature,
  };
}

const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

type Page = (cursor?: string) => Promise<{ data: any[]; cursor: string | null; total?: number }>;

export const contentSpecs = [
  defineHelix({
    type: 'twitch-helix-stream-markers',
    tier: 'extended',
    resource: 'stream markers',
    label: 'stream markers',
    help: 'Creates or lists stream markers. Creating needs a live stream and the broadcaster account.',
    scopes: ['channel:manage:broadcast', 'user:read:broadcast'],
    fields: [broadcaster],
    defaultAction: 'create',
    actions: {
      create: {
        label: 'create',
        help: "Adds a marker to a live stream at the current position. The channel's stream must be live.",
        scopes: ['channel:manage:broadcast'],
        fields: [
          {
            name: 'description',
            label: 'Description',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const marker = await api.streams.createStreamMarker(broadcasterId, input.description);
          return mapMarker(marker);
        },
      },
      list: {
        label: 'list',
        help: 'Lists the stream markers of a channel, optionally limited to a single video.',
        scopes: ['user:read:broadcast'],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'video',
            label: 'Video',
            kind: 'string',
            default: '',
            aliases: ['videoId'],
            faIcon: 'fa-video-camera',
            hint: 'optional: one video ID',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          input.video
            ? api.streams.getStreamMarkersForVideo(broadcasterId, input.video, {
                limit: input.limit,
                after: input.after,
              })
            : api.streams.getStreamMarkersForUser(broadcasterId, {
                limit: input.limit,
                after: input.after,
              }),
        map: (marker) => mapMarker(marker),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-clips',
    tier: 'core',
    resource: 'clips',
    label: 'clips',
    help: 'Creates a clip of a live stream or lists clips.',
    scopes: ['clips:edit'],
    fields: [],
    defaultAction: 'create',
    actions: {
      create: {
        label: 'create',
        help: 'Creates a clip of a running stream. The stream must be live.',
        scopes: ['clips:edit'],
        fields: [
          broadcaster,
          {
            name: 'createAfterDelay',
            label: 'Create after delay',
            kind: 'bool',
            default: false,
            faIcon: 'fa-clock-o',
            hint: 'account for the usual stream delay',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const createAfterDelay = input.createAfterDelay === true;
          const clipId = await api.clips.createClip({ channel: broadcasterId, createAfterDelay });
          return { id: clipId, broadcasterId, createAfterDelay };
        },
      },
      list: {
        label: 'list',
        help: "Lists clips by broadcaster, by clip IDs, or by game. When Clip IDs is set the IDs are looked up directly; otherwise a Game selects clips for that category, falling back to the broadcaster's clips.",
        scopes: [],
        fields: [
          broadcaster,
          {
            name: 'clipIds',
            label: 'Clip IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-scissors',
            hint: 'comma separated (takes priority)',
          },
          {
            name: 'game',
            label: 'Game',
            kind: 'string',
            default: '',
            aliases: ['gameId'],
            faIcon: 'fa-gamepad',
            hint: 'optional: category name or ID',
          },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, faIcon: 'fa-list-ol', hint: '1-100' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, faIcon: 'fa-download', hint: 'follows pages up to the maximum' },
          { name: 'allMax', label: 'Max', kind: 'int', default: 1000, faIcon: 'fa-arrow-up', hint: 'cap when Get all is set' },
        ],
        run: async ({ api, root, broadcasterId, input, msg }) => {
          const limit = clampLimit(input.limit, 20);
          const after = firstDefined(msg.after, msg.cursor);

          const clipIds = input.clipIds ?? [];
          if (clipIds.length) {
            const clips = await api.clips.getClipsByIds(clipIds);
            return { payload: clips.map(mapClip), cursor: null, total: clips.length };
          }

          let fetchPage: Page;
          if (input.game) {
            const gameId = await resolveGameId(root, input.game);
            fetchPage = async (cursor?: string) => {
              const res = await api.clips.getClipsForGame(gameId, { limit, after: cursor ?? after });
              return { data: res.data, cursor: res.cursor ?? null, total: res.total };
            };
          } else {
            fetchPage = async (cursor?: string) => {
              const res = await api.clips.getClipsForBroadcaster(broadcasterId, { limit, after: cursor ?? after });
              return { data: res.data, cursor: res.cursor ?? null, total: res.total };
            };
          }

          const result =
            input.all === true ? await fetchAllPages(fetchPage, input.allMax ?? 1000) : await fetchPage();
          return { payload: result.data.map(mapClip), cursor: result.cursor ?? null, total: result.total };
        },
        map: (result) => result.payload,
        extra: (result) => ({ pagination: { cursor: result.cursor ?? null }, total: result.total }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-videos',
    tier: 'extended',
    resource: 'videos',
    label: 'videos',
    help: 'Lists videos or deletes one or more videos by ID.',
    scopes: ['channel:manage:videos'],
    fields: [],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists videos by user or by video IDs, with optional type, period, sort and language filters. When Video IDs is set the IDs are looked up directly and the filters are ignored.',
        scopes: [],
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            default: '',
            aliases: ['userId'],
            primary: true,
            faIcon: 'fa-user',
            hint: 'blank = authenticated user',
          },
          {
            name: 'videoIds',
            label: 'Video IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-video-camera',
            hint: 'comma separated (takes priority)',
          },
          {
            name: 'type',
            label: 'Type',
            kind: 'select',
            default: '',
            aliases: ['videoType'],
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'any' },
              { value: 'all', label: 'all' },
              { value: 'upload', label: 'upload' },
              { value: 'archive', label: 'archive' },
              { value: 'highlight', label: 'highlight' },
            ],
          },
          {
            name: 'period',
            label: 'Period',
            kind: 'select',
            default: '',
            faIcon: 'fa-calendar',
            options: [
              { value: '', label: 'any' },
              { value: 'all', label: 'all' },
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
            ],
          },
          {
            name: 'sort',
            label: 'Sort',
            kind: 'select',
            default: '',
            aliases: ['orderBy'],
            faIcon: 'fa-sort',
            options: [
              { value: '', label: 'time (default)' },
              { value: 'time', label: 'time' },
              { value: 'trending', label: 'trending' },
              { value: 'views', label: 'views' },
            ],
          },
          { name: 'language', label: 'Language', kind: 'string', default: '', faIcon: 'fa-language', hint: 'optional, e.g. en' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, faIcon: 'fa-list-ol', hint: '1-100' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, faIcon: 'fa-download', hint: 'follows pages up to the maximum' },
          { name: 'allMax', label: 'Max', kind: 'int', default: 1000, faIcon: 'fa-arrow-up', hint: 'cap when Get all is set' },
        ],
        run: async ({ api, root, input, msg, config, moderatorId }) => {
          const limit = clampLimit(input.limit, 20);
          const after = firstDefined(msg.after, msg.cursor);

          const videoIds = input.videoIds ?? [];
          if (videoIds.length) {
            const videos = await api.videos.getVideosByIds(videoIds);
            return { payload: videos.map(mapVideo), cursor: null, total: videos.length };
          }

          let userId = input.user;
          if (!userId) {
            userId = await resolveUserId(root, firstDefined(toStr(config.broadcaster), moderatorId));
          }

          const filter: any = { limit, after };
          if (input.type) filter.type = input.type;
          if (input.period) filter.period = input.period;
          if (input.sort) filter.orderBy = input.sort;
          if (input.language) filter.language = input.language;

          const fetchPage: Page = async (cursor?: string) => {
            const res = await api.videos.getVideosByUser(userId, { ...filter, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const result =
            input.all === true ? await fetchAllPages(fetchPage, input.allMax ?? 1000) : await fetchPage();
          return { payload: result.data.map(mapVideo), cursor: result.cursor ?? null, total: result.total };
        },
        map: (result) => result.payload,
        extra: (result) => ({ pagination: { cursor: result.cursor ?? null }, total: result.total }),
      },
      delete: {
        label: 'delete',
        help: 'Deletes one or more videos by ID. This cannot be undone.',
        scopes: ['channel:manage:videos'],
        fields: [
          broadcaster,
          {
            name: 'videoIds',
            label: 'Video IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-video-camera',
            hint: 'comma separated',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const videoIds = input.videoIds ?? [];
          if (!videoIds.length) {
            throw new Error('A video ID is required — set msg.videoIds or the node video IDs');
          }

          await api.videos.deleteVideosByIds(broadcasterId, videoIds);
          return { broadcasterId, deleted: videoIds, count: videoIds.length };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-games',
    tier: 'advanced',
    resource: 'games',
    palette: false,
    label: 'games',
    help: 'Looks up a game/category, lists the top games or searches categories.',
    scopes: [],
    fields: [],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Looks up a single game/category by name or numeric ID and returns its details.',
        scopes: [],
        fields: [
          {
            name: 'game',
            label: 'Game/category',
            kind: 'string',
            default: '',
            aliases: ['category', 'query'],
            primary: true,
            faIcon: 'fa-gamepad',
            hint: 'name or numeric ID',
          },
        ],
        run: async ({ root, input }) => {
          const query = input.game;
          if (!query) throw new Error('A game/category name or ID is required');

          const game = /^\d+$/.test(query)
            ? await root.games.getGameById(query)
            : await root.games.getGameByName(query);
          if (!game) throw new Error(`Twitch category "${query}" could not be found`);

          return mapGame(game);
        },
      },
      top: {
        label: 'top',
        help: 'Lists the most viewed games/categories on Twitch right now.',
        scopes: [],
        paged: { limit: 20, max: 1000 },
        fields: [],
        run: async ({ api, input }) =>
          api.games.getTopGames({ limit: input.limit, after: input.after }),
        map: (game) => mapGame(game),
      },
      search: {
        label: 'search',
        help: 'Searches games/categories by a partial or exact query.',
        scopes: [],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'query',
            label: 'Query',
            kind: 'string',
            default: '',
            aliases: ['search'],
            primary: true,
            faIcon: 'fa-search',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, input }) => {
          if (!input.query) throw new Error('A search query is required');
          return api.search.searchCategories(input.query, { limit: input.limit, after: input.after });
        },
        map: (game) => mapGame(game),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-search',
    tier: 'advanced',
    resource: 'search',
    palette: false,
    label: 'search channels',
    help: 'Searches channels by a partial or exact query, optionally limited to live channels.',
    scopes: [],
    paged: { limit: 20, max: 1000 },
    fields: [
      {
        name: 'query',
        label: 'Query',
        kind: 'string',
        default: '',
        aliases: ['search'],
        primary: true,
        faIcon: 'fa-search',
        hint: 'msg.payload overrides this',
      },
      {
        name: 'liveOnly',
        label: 'Live only',
        kind: 'select',
        default: '',
        faIcon: 'fa-signal',
        options: [
          { value: '', label: 'any' },
          { value: 'true', label: 'live only' },
        ],
      },
    ],
    run: async ({ api, input }) => {
      if (!input.query) throw new Error('A search query is required');
      return api.search.searchChannels(input.query, {
        liveOnly: toBool(input.liveOnly) || undefined,
        limit: input.limit,
        after: input.after,
      });
    },
    map: (result) => mapSearchResult(result),
  }),

  defineHelix({
    type: 'twitch-helix-raids',
    tier: 'extended',
    resource: 'raids',
    label: 'raids',
    help: 'Starts or cancels a raid.',
    scopes: ['channel:manage:raids'],
    context: 'broadcaster',
    fields: [broadcaster],
    defaultAction: 'start',
    actions: {
      start: {
        label: 'start',
        help: 'Starts a raid from a live channel to another live channel.',
        scopes: ['channel:manage:raids'],
        fields: [
          {
            name: 'target',
            label: 'Target channel',
            kind: 'user',
            required: true,
            aliases: ['targetChannel', 'to'],
            primary: true,
            faIcon: 'fa-share',
            hint: 'username or ID',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const raid = await api.raids.startRaid(broadcasterId, input.target);
          return {
            fromBroadcasterId: broadcasterId,
            toBroadcasterId: input.target,
            creationDate: raid.creationDate,
            targetIsMature: raid.targetIsMature,
          };
        },
      },
      cancel: {
        label: 'cancel',
        help: 'Cancels a raid the channel has started.',
        scopes: ['channel:manage:raids'],
        fields: [],
        run: async ({ api, broadcasterId }) => {
          await api.raids.cancelRaid(broadcasterId);
          return { broadcasterId, cancelled: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-streams',
    tier: 'core',
    resource: 'streams',
    label: 'get streams',
    help: 'Fetches a list of active Twitch streams based on your configuration parameters.',
    scopes: [],
    fields: [
      { name: 'userId', label: 'User ID', kind: 'string', default: '', faIcon: 'fa-user', hint: 'e.g., 125328655' },
      { name: 'userName', label: 'User Name', kind: 'string', default: '', faIcon: 'fa-user-circle', hint: 'e.g., Neon_Woof' },
      { name: 'game', label: 'Game ID', kind: 'string', default: '', faIcon: 'fa-gamepad', hint: 'e.g., 509658' },
      {
        name: 'streamType',
        label: 'Stream type',
        kind: 'select',
        default: 'all',
        hidden: true,
        options: [
          { value: 'all', label: 'all' },
          { value: 'live', label: 'live' },
        ],
      },
      { name: 'limit', label: 'Limit', kind: 'int', default: '', faIcon: 'fa-list', hint: 'results per page (default 20, max 100)' },
    ],
    run: async ({ api, msg, config }) => {
      const filter: any = {};

      const userId = firstDefined(msg.userId, config.userId);
      if (userId) filter.userId = userId;

      const userName = firstDefined(msg.userName, config.userName);
      if (userName) filter.userName = userName;

      const game = firstDefined(msg.game, config.game);
      if (game) filter.game = game;

      const language = firstDefined(msg.language, config.language);
      if (language) filter.language = language;

      let streamType = firstDefined(msg.type, msg.streamType, config.streamType, 'all');
      if (streamType !== 'live' && streamType !== 'all') streamType = 'all';
      filter.type = streamType;

      const limit = firstDefined(msg.limit, config.limit, 20);
      if (limit) filter.limit = Number(limit);

      if (msg.after) filter.after = msg.after;
      if (msg.before) filter.before = msg.before;

      const result = await api.streams.getStreams(filter);
      return { data: result.data.map(toPlainStream), cursor: result.cursor ?? null };
    },
  }),

  defineHelix({
    type: 'twitch-helix-followed-streams',
    tier: 'extended',
    resource: 'streams',
    palette: false,
    label: 'followed streams',
    help: 'Lists the live streams a user follows.',
    scopes: ['user:read:follows'],
    paged: { limit: 20, max: 1000 },
    fields: [
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        aliases: ['userId'],
        hint: 'blank = authenticated user',
        faIcon: 'fa-user',
      },
    ],
    run: async ({ api, moderatorId, input }) =>
      api.streams.getFollowedStreams(input.user ?? moderatorId, {
        limit: input.limit,
        after: input.after,
      }),
    map: (stream) => toPlainStream(stream),
  }),
];
