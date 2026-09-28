import { defineHelix } from '../define';
import { broadcaster, triState } from './common';
import {
  mapChannel,
  mapFollowedChannel,
  mapFollower,
  resolveGameId,
  toBool,
} from '../twitch-helix-utils';

function mapEditor(editor: any) {
  return {
    userId: editor.userId,
    userDisplayName: editor.userDisplayName,
    creationDate: editor.creationDate,
  };
}

const VALID_COMMERCIAL_LENGTHS = [30, 60, 90, 120, 150, 180];

export const channelSpecs = [
  defineHelix({
    type: 'twitch-helix-get-channel-info',
    group: 'channels',
    tier: 'core',
    label: 'get channel info',
    help: "Gets a channel's title, game, language and tags. Leave Broadcaster blank to use the authenticated account.",
    scopes: [],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const channel = await api.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);
      return channel;
    },
    map: (channel) => mapChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-update-channel-info',
    group: 'channels',
    tier: 'core',
    label: 'update channel info',
    help: "Updates a channel's title, game, tags or language. Only the fields you fill in are changed; the node fetches and returns the channel afterwards. The authenticated account must be the broadcaster.",
    scopes: ['channel:manage:broadcast'],
    fields: [
      broadcaster,
      {
        name: 'title',
        label: 'Title',
        kind: 'string',
        default: '',
        faIcon: 'fa-header',
        hint: 'blank = leave unchanged',
      },
      {
        name: 'game',
        label: 'Game',
        kind: 'string',
        default: '',
        aliases: ['gameId'],
        faIcon: 'fa-gamepad',
        hint: 'category name or ID',
      },
      {
        name: 'tags',
        label: 'Tags',
        kind: 'idList',
        default: '',
        faIcon: 'fa-tags',
        hint: 'comma separated, blank = leave unchanged',
      },
      {
        name: 'language',
        label: 'Language',
        kind: 'string',
        default: '',
        faIcon: 'fa-language',
        hint: 'e.g. en',
      },
      {
        name: 'labels',
        label: 'Content labels',
        kind: 'idList',
        default: '',
        aliases: ['contentClassificationLabels'],
        faIcon: 'fa-flag',
        hint: 'comma separated label IDs, blank = leave unchanged',
      },
      {
        name: 'delay',
        label: 'Delay (s)',
        kind: 'int',
        default: '',
        faIcon: 'fa-clock-o',
        hint: 'partners only, blank = leave unchanged',
      },
      {
        name: 'isBrandedContent',
        label: 'Branded content',
        kind: 'select',
        default: '',
        faIcon: 'fa-briefcase',
        options: triState(),
      },
    ],
    run: async ({ api, root, broadcasterId, input, raw }) => {
      const data: any = {};

      if (input.title !== undefined) data.title = input.title;
      if (input.game !== undefined) data.gameId = await resolveGameId(root, input.game);
      if (input.language !== undefined) data.language = input.language;
      if (input.tags.length) data.tags = input.tags;
      if (input.labels.length) data.contentClassificationLabels = input.labels;
      if (raw.delay !== undefined && input.delay !== undefined) data.delay = input.delay;
      const branded = toBool(input.isBrandedContent);
      if (branded !== undefined) data.isBrandedContent = branded;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set a title, game, tags, language, labels or delay');
      }

      await api.channels.updateChannelInfo(broadcasterId, data);

      const channel = await root.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);

      return channel;
    },
    map: (channel) => mapChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-get-followers',
    group: 'followers',
    tier: 'core',
    label: 'get followers',
    help: "Lists a channel's followers, most recent first. Set User to a single login to just confirm whether that user follows. The authenticated account must be a moderator or the broadcaster.",
    scopes: ['moderator:read:followers'],
    paged: { limit: 20 },
    fields: [
      broadcaster,
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        faIcon: 'fa-search',
        hint: 'optional: check one follower',
      },
    ],
    run: async ({ api, broadcasterId, input }) =>
      api.channels.getChannelFollowers(broadcasterId, input.user, {
        limit: input.limit,
        after: input.after,
      }),
    map: (follower) => mapFollower(follower),
  }),

  defineHelix({
    type: 'twitch-helix-get-followed-channels',
    group: 'followers',
    tier: 'core',
    label: 'get followed channels',
    help: 'Lists the channels the authenticated account follows. Set Channel to a single login to just confirm whether they follow it.',
    scopes: ['user:read:follows'],
    paged: { limit: 20 },
    fields: [
      {
        name: 'broadcaster',
        label: 'Channel',
        kind: 'user',
        optional: true,
        faIcon: 'fa-search',
        hint: 'optional: check one channel',
      },
    ],
    run: async ({ api, input, moderatorId }) =>
      api.channels.getFollowedChannels(moderatorId, input.broadcaster, {
        limit: input.limit,
        after: input.after,
      }),
    map: (channel) => mapFollowedChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-ads',
    group: 'ads',
    tier: 'extended',
    label: 'ads',
    help: 'Reads the ad schedule, snoozes the next ad or starts a commercial break.',
    scopes: ['channel:read:ads', 'channel:manage:ads', 'channel:edit:commercial'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get schedule',
        help: 'Gets the ad schedule: available snoozes, next ad time and pre-roll free time.',
        scopes: ['channel:read:ads'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.channels.getAdSchedule(broadcasterId),
        map: (schedule, { broadcasterId }) => ({
          broadcasterId,
          snoozeCount: schedule.snoozeCount,
          snoozeRefreshDate: schedule.snoozeRefreshDate ?? null,
          nextAdDate: schedule.nextAdDate ?? null,
          duration: schedule.duration,
          lastAdDate: schedule.lastAdDate ?? null,
          prerollFreeTime: schedule.prerollFreeTime,
        }),
      },
      snooze: {
        label: 'snooze',
        help: 'Snoozes the next ad when a snooze is available.',
        scopes: ['channel:manage:ads'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.channels.snoozeNextAd(broadcasterId),
        map: (result, { broadcasterId }) => ({
          broadcasterId,
          snoozeCount: result.snoozeCount,
          snoozeRefreshDate: result.snoozeRefreshDate,
          nextAdDate: result.nextAdDate,
        }),
      },
      start: {
        label: 'start commercial',
        help: 'Starts a commercial break.',
        scopes: ['channel:edit:commercial'],
        fields: [
          {
            name: 'length',
            label: 'Length (s)',
            kind: 'int',
            default: 30,
            primary: true,
            aliases: ['commercialLength'],
            faIcon: 'fa-hourglass-half',
            hint: '30, 60, 90, 120, 150 or 180',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const length = input.length ?? 30;
          if (VALID_COMMERCIAL_LENGTHS.indexOf(length) === -1) {
            throw new Error(
              `Commercial length must be one of ${VALID_COMMERCIAL_LENGTHS.join(', ')} seconds`
            );
          }

          await api.channels.startChannelCommercial(broadcasterId, length);
          return { broadcasterId, length, started: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-stream-key',
    group: 'channels',
    tier: 'advanced',
    label: 'get stream key',
    help: "Gets the channel's stream key. Treat the result as a secret. The authenticated account must be the broadcaster.",
    scopes: ['channel:read:stream_key'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const streamKey = await api.streams.getStreamKey(broadcasterId);
      return { streamKey, broadcasterId };
    },
  }),

  defineHelix({
    type: 'twitch-helix-channel-editors',
    group: 'channels',
    tier: 'advanced',
    label: 'channel editors',
    help: 'Lists the editors of a channel.',
    scopes: ['channel:read:editors'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) =>
      (await api.channels.getChannelEditors(broadcasterId)).map(mapEditor),
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),
];
