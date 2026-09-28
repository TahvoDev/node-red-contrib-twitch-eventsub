import { defineHelix } from '../define';
import {
  mapChannel,
  mapFollowedChannel,
  mapFollower,
  resolveGameId,
} from '../twitch-helix-utils';

const VALID_COMMERCIAL_LENGTHS = [30, 60, 90, 120, 150, 180];

function mapTeam(team: any) {
  return {
    id: team.id,
    name: team.name,
    displayName: team.displayName,
    backgroundImageUrl: team.backgroundImageUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    creationDate: team.creationDate,
    updateDate: team.updateDate,
    info: team.info,
    logoThumbnailUrl: team.logoThumbnailUrl,
  };
}

export const channelSpecs = [
  defineHelix({
    type: 'twitch-helix-get-channel-info',
    label: 'get channel info',
    help: "Gets a channel's title, game, language and tags. Leave Broadcaster blank to use the authenticated account.",
    scopes: [],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => {
      const channel = await api.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);
      return channel;
    },
    map: (channel) => mapChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-update-channel-info',
    label: 'update channel info',
    help: "Updates a channel's title, game, tags or language. Only the fields you fill in are changed; the node fetches and returns the channel afterwards. The authenticated account must be the broadcaster.",
    scopes: ['channel:manage:broadcast'],
    context: 'broadcaster',
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
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
    ],
    run: async ({ api, root, broadcasterId, input }) => {
      const data: any = {};

      if (input.title !== undefined) data.title = input.title;
      if (input.game !== undefined) data.gameId = await resolveGameId(root, input.game);
      if (input.language !== undefined) data.language = input.language;
      if (input.tags.length) data.tags = input.tags;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set a title, game, tags or language');
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
    label: 'get followers',
    help: "Lists a channel's followers, most recent first. Set User to a single login to just confirm whether that user follows. The authenticated account must be a moderator or the broadcaster.",
    scopes: ['moderator:read:followers'],
    paged: { limit: 20, max: 1000 },
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
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
    label: 'get followed channels',
    help: 'Lists the channels a user follows. Set Channel to a single login to just confirm whether the user follows it. Defaults to the authenticated account.',
    scopes: ['user:read:follows'],
    paged: { limit: 20, max: 1000 },
    fields: [
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
      {
        name: 'broadcaster',
        label: 'Channel',
        kind: 'user',
        optional: true,
        faIcon: 'fa-search',
        hint: 'optional: check one channel',
      },
    ],
    run: async ({ root, input, moderatorId }) => {
      const userId = input.user ?? moderatorId;
      return root.asUser(userId, (ctx: any) =>
        ctx.channels.getFollowedChannels(userId, input.broadcaster, {
          limit: input.limit,
          after: input.after,
        })
      );
    },
    map: (channel) => mapFollowedChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-get-ad-schedule',
    label: 'get ad schedule',
    help: "Gets a channel's ad schedule: available snoozes, next ad time and pre-roll free time. The authenticated account must be the broadcaster.",
    scopes: ['channel:read:ads'],
    context: 'broadcaster',
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
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
  }),

  defineHelix({
    type: 'twitch-helix-snooze-next-ad',
    label: 'snooze next ad',
    help: "Snoozes the channel's next ad when a snooze is available. The authenticated account must be the broadcaster.",
    scopes: ['channel:manage:ads'],
    context: 'broadcaster',
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => api.channels.snoozeNextAd(broadcasterId),
    map: (result, { broadcasterId }) => ({
      broadcasterId,
      snoozeCount: result.snoozeCount,
      snoozeRefreshDate: result.snoozeRefreshDate,
      nextAdDate: result.nextAdDate,
    }),
  }),

  defineHelix({
    type: 'twitch-helix-start-commercial',
    label: 'start commercial',
    help: 'Starts a commercial break on a channel. The authenticated account must be the broadcaster.',
    scopes: ['channel:edit:commercial'],
    context: 'broadcaster',
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
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
  }),

  defineHelix({
    type: 'twitch-helix-get-channel-teams',
    label: 'get channel teams',
    help: 'Lists the Twitch teams a channel belongs to.',
    scopes: [],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => {
      const teams = await api.teams.getTeamsForBroadcaster(broadcasterId);
      return teams.map(mapTeam);
    },
    extra: (teams) => ({ pagination: { cursor: null }, total: teams.length }),
  }),

  defineHelix({
    type: 'twitch-helix-get-stream-key',
    label: 'get stream key',
    help: "Gets the channel's stream key. Treat the result as a secret. The authenticated account must be the broadcaster.",
    scopes: ['channel:read:stream_key'],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => {
      const streamKey = await api.streams.getStreamKey(broadcasterId);
      return { streamKey, broadcasterId };
    },
  }),
];
