import { getRawData } from '@twurple/common';
import { defineHelix, type HelixField } from '../define';
import { broadcaster, selfUser, triState } from './fields';
import { mapBitsEntry, mapGoal, mapTeam, mapSegment, mapSubscription, mapHypeTrainEvent, mapCharityAmount , mapReward, mapRedemption, mapPoll, mapPrediction, toStringList } from './mappers';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  resolveAllMax,
  resolveGameId,
  toBool,
  toIdList,
  toInt,
  toStr,
} from '../twitch-helix-utils';

const PERIODS = ['day', 'week', 'month', 'year', 'all'];

const REDEMPTION_STATUSES = ['UNFULFILLED', 'FULFILLED', 'CANCELED'];
const TARGET_STATUSES = ['FULFILLED', 'CANCELED'];
const enableOptions = triState();

const rewardIdField: HelixField = {
  name: 'rewardId',
  label: 'Reward ID',
  kind: 'string',
  default: '',
  hint: 'required',
  faIcon: 'fa-gift',
};

const segmentId: HelixField = {
  name: 'segmentId',
  label: 'Segment ID',
  kind: 'string',
  required: true,
  aliases: ['id'],
  faIcon: 'fa-hashtag',
};

export const monetisationSpecs = [
  defineHelix({
    type: 'twitch-helix-bits',
    tier: 'advanced',
    label: 'bits',
    help: 'Gets the Bits leaderboard or the Bits cheermotes.',
    scopes: ['bits:read'],
    fields: [],
    defaultAction: 'leaderboard',
    actions: {
      leaderboard: {
        label: 'leaderboard',
        help: 'Gets the Bits leaderboard for a channel. Set Center on user to make sure one user appears with others ranked around them.',
        scopes: ['bits:read'],
        fields: [
          broadcaster,
          {
            name: 'count',
            label: 'Count',
            kind: 'int',
            default: 20,
            aliases: ['limit'],
            faIcon: 'fa-list-ol',
            hint: '1-100',
          },
          {
            name: 'period',
            label: 'Period',
            kind: 'select',
            default: '',
            faIcon: 'fa-calendar',
            options: [
              { value: '', label: 'Twitch default (all)' },
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
              { value: 'year', label: 'year' },
              { value: 'all', label: 'all' },
            ],
          },
          {
            name: 'startDate',
            label: 'Start date',
            kind: 'string',
            default: '',
            aliases: ['startingDate'],
            faIcon: 'fa-clock-o',
            hint: 'optional: RFC3339 date',
          },
          {
            name: 'user',
            label: 'Center on user',
            kind: 'user',
            optional: true,
            aliases: ['contextUser'],
            faIcon: 'fa-search',
            hint: 'optional: show one user',
          },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          const count = clampLimit(input.count, 20);

          if (raw.period && PERIODS.indexOf(String(raw.period)) === -1) {
            throw new Error(`period must be one of ${PERIODS.join(', ')}`);
          }

          const startDateText = toStr(input.startDate);
          let startDate: Date | undefined;
          if (startDateText) {
            startDate = new Date(startDateText);
            if (Number.isNaN(startDate.getTime())) {
              throw new Error(`startDate "${startDateText}" is not a valid date`);
            }
          }

          const params: any = { count };
          if (input.period) params.period = input.period;
          if (startDate) params.startDate = startDate;
          if (input.user) params.contextUserId = input.user;

          return api.bits.getLeaderboard(broadcasterId, params);
        },
        map: (leaderboard) => (leaderboard?.entries ?? []).map(mapBitsEntry),
        extra: (leaderboard) => ({
          pagination: { cursor: null },
          total: leaderboard?.totalCount,
        }),
      },
      cheermotes: {
        label: 'cheermotes',
        help: "Lists the Bits cheermotes Twitch supports, including each tier's images. Leave Channel blank for global cheermotes, or set it to a channel to also include its custom cheermotes.",
        scopes: [],
        fields: [
          {
            name: 'broadcaster',
            label: 'Channel',
            kind: 'user',
            optional: true,
            primary: true,
            aliases: ['broadcasterId'],
            hint: 'blank = global cheermotes only',
            faIcon: 'fa-user',
          },
        ],
        run: async ({ api, input }) => {
          const list = await api.bits.getCheermotes(input.broadcaster);
          const raw = getRawData(list) as Record<string, any>;

          return Object.keys(raw).map((prefix) => {
            const cheermote = raw[prefix];
            return {
              prefix: cheermote.prefix ?? prefix,
              type: cheermote.type,
              order: cheermote.order,
              lastUpdated: cheermote.last_updated ?? null,
              tiers: (cheermote.tiers ?? []).map((tier: any) => ({
                minBits: tier.min_bits,
                id: tier.id,
                color: tier.color,
                canCheer: tier.can_cheer,
                showInBitsCard: tier.show_in_bits_card,
                images: tier.images,
              })),
            };
          });
        },
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-subscriptions',
    tier: 'advanced',
    label: 'subscriptions',
    help: "Lists a channel's subscribers or checks one user's subscription.",
    scopes: ['channel:read:subscriptions', 'user:read:subscriptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's subscribers. Set User to check a single user instead, which returns that user's subscription if they have one.",
        scopes: ['channel:read:subscriptions'],
        paged: { limit: 20 },
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            faIcon: 'fa-search',
            hint: 'optional: check one subscriber',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          if (input.user) {
            const subs = await api.subscriptions.getSubscriptionsForUsers(broadcasterId, [input.user]);
            return { data: subs, cursor: null, total: subs.length };
          }
          return api.subscriptions.getSubscriptions(broadcasterId, {
            limit: input.limit,
            after: input.after,
          });
        },
        map: (sub) => mapSubscription(sub),
      },
      check: {
        label: 'check',
        help: "Checks whether a user is subscribed to a channel, using the authenticated user's token. Blank User defaults to the authenticated account.",
        scopes: ['user:read:subscriptions'],
        fields: [
          { ...selfUser, primary: true, faIcon: 'fa-search' },
        ],
        run: async ({ api, broadcasterId, input, moderatorId }) => {
          const userId = input.user ?? moderatorId;

          const subscription = await api.subscriptions.checkUserSubscription(userId, broadcasterId);
          if (!subscription) return null;

          return {
            userId,
            broadcasterId: subscription.broadcasterId,
            broadcasterName: subscription.broadcasterName,
            broadcasterDisplayName: subscription.broadcasterDisplayName,
            isGift: subscription.isGift,
            tier: subscription.tier,
          };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-schedule',
    tier: 'extended',
    label: 'schedule',
    help: "Reads or changes a channel's streaming schedule segments.",
    scopes: ['channel:manage:schedule'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: "Gets a channel's streaming schedule as a list of segments.",
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'startDate',
            label: 'From date',
            kind: 'string',
            default: '',
            faIcon: 'fa-calendar',
            hint: 'optional: RFC3339 date',
          },
          {
            name: 'utcOffset',
            label: 'UTC offset',
            kind: 'int',
            default: '',
            faIcon: 'fa-clock-o',
            hint: 'optional: minutes',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const filter: any = { limit: input.limit, after: input.after };
          if (input.startDate !== undefined) filter.startDate = input.startDate;
          if (input.utcOffset !== undefined) filter.utcOffset = input.utcOffset;

          const res = await api.schedule.getSchedule(broadcasterId, filter);
          return {
            data: res.data?.segments ?? [],
            cursor: res.cursor ?? null,
            total: undefined,
          };
        },
        map: (segment) => mapSegment(segment),
      },
      create: {
        label: 'create segment',
        help: "Adds a segment to a channel's streaming schedule. Twitch requires startDate (in UTC) and timezone; duration defaults to 240 minutes and isRecurring to false.",
        scopes: ['channel:manage:schedule'],
        fields: [
          {
            name: 'startDate',
            label: 'Start date (UTC)',
            kind: 'string',
            required: true,
            aliases: ['startTime'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-01T18:00:00Z',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            required: true,
            faIcon: 'fa-globe',
            hint: 'e.g. America/New_York',
          },
          {
            name: 'duration',
            label: 'Duration (min)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'optional: default 240',
          },
          {
            name: 'isRecurring',
            label: 'Recurring',
            kind: 'select',
            default: '',
            faIcon: 'fa-repeat',
            options: triState('no', 'weekly', 'no'),
          },
          {
            name: 'categoryId',
            label: 'Category',
            kind: 'string',
            default: '',
            aliases: ['category'],
            faIcon: 'fa-gamepad',
            hint: 'optional: category name or ID',
          },
          {
            name: 'title',
            label: 'Title',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, root, broadcasterId, input }) => {
          const data: any = {
            startDate: input.startDate,
            timezone: input.timezone,
            isRecurring: toBool(input.isRecurring) === true,
          };
          if (input.duration !== undefined) data.duration = input.duration;
          if (input.categoryId !== undefined) {
            data.categoryId = await resolveGameId(root, input.categoryId);
          }
          if (input.title !== undefined) data.title = input.title;

          const segment = await api.schedule.createScheduleSegment(broadcasterId, data);
          return mapSegment(segment);
        },
      },
      update: {
        label: 'update segment',
        help: 'Changes an existing schedule segment. Only the fields you fill in are sent; leave a field blank to keep its current value.',
        scopes: ['channel:manage:schedule'],
        fields: [
          segmentId,
          {
            name: 'startDate',
            label: 'Start date (UTC)',
            kind: 'string',
            default: '',
            aliases: ['startTime'],
            faIcon: 'fa-calendar',
            hint: 'leave blank to keep',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            default: '',
            faIcon: 'fa-globe',
            hint: 'leave blank to keep',
          },
          {
            name: 'duration',
            label: 'Duration (min)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'leave blank to keep',
          },
          {
            name: 'isCanceled',
            label: 'Canceled',
            kind: 'select',
            default: '',
            faIcon: 'fa-ban',
            options: triState('leave unchanged', 'yes', 'no'),
          },
          {
            name: 'categoryId',
            label: 'Category',
            kind: 'string',
            default: '',
            aliases: ['category'],
            faIcon: 'fa-gamepad',
            hint: 'leave blank to keep',
          },
          {
            name: 'title',
            label: 'Title',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'leave blank to keep',
          },
        ],
        run: async ({ api, root, broadcasterId, input }) => {
          const data: any = {};
          if (input.startDate !== undefined) data.startDate = input.startDate;
          if (input.timezone !== undefined) data.timezone = input.timezone;
          if (input.duration !== undefined) data.duration = input.duration;
          if (input.categoryId !== undefined) {
            data.categoryId = await resolveGameId(root, input.categoryId);
          }
          if (input.title !== undefined) data.title = input.title;

          const isCanceled = toBool(input.isCanceled);
          if (isCanceled !== undefined) data.isCanceled = isCanceled;

          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set a startDate, timezone, duration, title or category');
          }

          const segment = await api.schedule.updateScheduleSegment(
            broadcasterId,
            input.segmentId,
            data
          );
          return mapSegment(segment);
        },
      },
      delete: {
        label: 'delete segment',
        help: "Removes a segment from a channel's schedule.",
        scopes: ['channel:manage:schedule'],
        fields: [segmentId],
        run: async ({ api, broadcasterId, input }) => {
          await api.schedule.deleteScheduleSegment(broadcasterId, input.segmentId);
          return { segmentId: input.segmentId, deleted: true };
        },
      },
      segment: {
        label: 'get segment',
        help: 'Gets a single schedule segment by ID.',
        scopes: [],
        fields: [segmentId],
        run: async ({ api, broadcasterId, input }) =>
          api.schedule.getScheduleSegmentById(broadcasterId, input.segmentId),
        map: (segment) => (segment ? mapSegment(segment) : null),
      },
      ical: {
        label: 'get ical',
        help: "Gets the channel's schedule as an iCalendar string.",
        scopes: [],
        fields: [],
        run: async ({ api, broadcasterId }) => api.schedule.getScheduleAsIcal(broadcasterId),
      },
      settings: {
        label: 'update settings',
        help: 'Sets or clears the schedule vacation. Blank dates clear it.',
        scopes: ['channel:manage:schedule'],
        fields: [
          {
            name: 'startDate',
            label: 'Vacation start (UTC)',
            kind: 'string',
            default: '',
            aliases: ['vacationStart'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-01T00:00:00Z',
          },
          {
            name: 'endDate',
            label: 'Vacation end (UTC)',
            kind: 'string',
            default: '',
            aliases: ['vacationEnd'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-08T00:00:00Z',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            default: '',
            aliases: ['vacationTimezone'],
            faIcon: 'fa-globe',
            hint: 'e.g. America/New_York',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const startDate = toStr(input.startDate);
          const endDate = toStr(input.endDate);
          const timezone = toStr(input.timezone);

          if (!startDate && !endDate && !timezone) {
            await api.schedule.updateScheduleSettings(broadcasterId, { vacation: null });
            return { vacation: null };
          }
          if (!startDate || !endDate || !timezone) {
            throw new Error('A vacation needs a start date, end date and timezone — or leave all blank to clear');
          }

          await api.schedule.updateScheduleSettings(broadcasterId, {
            vacation: { startDate, endDate, timezone },
          });
          return { vacation: { startDate, endDate, timezone } };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-teams',
    tier: 'advanced',
    label: 'teams',
    help: 'Looks up a Twitch team by ID or name, or lists the teams a channel belongs to.',
    scopes: [],
    fields: [],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Looks up a Twitch team by ID or name and returns its details and members. Twitch has no endpoint that lists every team, so supply an ID or name (a numeric msg.team is treated as an ID).',
        scopes: [],
        fields: [
          {
            name: 'teamId',
            label: 'Team ID',
            kind: 'string',
            default: '',
            faIcon: 'fa-hashtag',
            hint: 'look up by ID',
          },
          {
            name: 'teamName',
            label: 'Team name',
            kind: 'string',
            default: '',
            faIcon: 'fa-users',
            hint: 'look up by name',
          },
        ],
        run: async ({ root, input, msg }) => {
          const id = toStr(input.teamId);
          const name = toStr(input.teamName);
          const generic = toStr(firstDefined(msg.team, msg.payload));

          let team: any;
          if (id) {
            team = await root.teams.getTeamById(id);
          } else if (name) {
            team = await root.teams.getTeamByName(name);
          } else if (generic) {
            team = /^\d+$/.test(generic)
              ? await root.teams.getTeamById(generic)
              : await root.teams.getTeamByName(generic);
          } else {
            throw new Error('A team ID or name is required — set teamId, teamName or msg.team');
          }

          return team ? [mapTeam(team)] : [];
        },
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      channel: {
        label: 'channel',
        help: 'Lists the Twitch teams a channel belongs to.',
        scopes: [],
        fields: [broadcaster],
        run: async ({ api, broadcasterId }) => {
          const teams = await api.teams.getTeamsForBroadcaster(broadcasterId);
          return teams.map(mapTeam);
        },
        extra: (teams) => ({ pagination: { cursor: null }, total: teams.length }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-charity',
    tier: 'advanced',
    label: 'charity',
    help: "Reads a channel's active charity campaign and its donations.",
    scopes: ['channel:read:charity'],
    fields: [broadcaster],
    defaultAction: 'campaign',
    actions: {
      campaign: {
        label: 'campaign',
        help: 'Gets the charity campaign a channel is currently running, or null when there is no active campaign.',
        scopes: ['channel:read:charity'],
        fields: [],
        run: async ({ api, broadcasterId }) => {
          const campaign = await api.charity.getCharityCampaign(broadcasterId);
          if (!getRawData(campaign)) return null;

          return {
            id: campaign.id,
            broadcasterId: campaign.broadcasterId,
            broadcasterName: campaign.broadcasterName,
            broadcasterDisplayName: campaign.broadcasterDisplayName,
            charityName: campaign.charityName,
            charityDescription: campaign.charityDescription,
            charityLogo: campaign.charityLogo,
            charityWebsite: campaign.charityWebsite,
            currentAmount: mapCharityAmount(campaign.currentAmount),
            targetAmount: mapCharityAmount(campaign.targetAmount),
          };
        },
      },
      donations: {
        label: 'donations',
        help: 'Lists the donations to the channel charity campaign.',
        scopes: ['channel:read:charity'],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.charity.getCharityCampaignDonations(broadcasterId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (donation) => ({
          campaignId: donation.campaignId,
          donorId: donation.donorId,
          donorName: donation.donorName,
          donorDisplayName: donation.donorDisplayName,
          amount: mapCharityAmount(donation.amount),
        }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-hype-train',
    tier: 'advanced',
    label: 'get hype train',
    help: 'Gets Hype Train events for a channel. Twitch exposes no REST endpoint for the current Hype Train, so this returns the recorded events of the current or latest train (paginated), not a live snapshot.',
    scopes: ['channel:read:hype_train'],
    paged: { limit: 20 },
    fields: [broadcaster],
    run: async ({ api, broadcasterId, input }) =>
      api.hypeTrain.getHypeTrainEventsForBroadcaster(broadcasterId, {
        limit: input.limit,
        after: input.after,
      }),
    map: (event) => mapHypeTrainEvent(event),
  }),

  defineHelix({
    type: 'twitch-helix-goals',
    tier: 'advanced',
    label: 'get goals',
    help: "Gets a channel's active creator goals (follower and subscription targets).",
    scopes: ['channel:read:goals'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const goals = await api.goals.getGoals(broadcasterId);
      return goals.map(mapGoal);
    },
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),

  defineHelix({
    type: 'twitch-helix-whispers',
    tier: 'advanced',
    label: 'send whisper',
    help: 'Sends a whisper from the authenticated account to another user. Twitch may silently drop whispers it considers abusive, so a success only means the request was accepted.',
    scopes: ['user:manage:whispers'],
    fields: [
      {
        name: 'to',
        label: 'Recipient',
        kind: 'user',
        required: true,
        aliases: ['recipient', 'user'],
        faIcon: 'fa-user',
        hint: 'username or user ID',
      },
      {
        name: 'message',
        label: 'Message',
        kind: 'string',
        default: '',
        primary: true,
        required: true,
        aliases: ['text'],
        faIcon: 'fa-comment',
        hint: 'msg.payload overrides this',
      },
    ],
    run: async ({ api, moderatorId, input }) => {
      const toUserId = input.to;
      const message = input.message;
      if (!message) {
        throw new Error('Whisper text is required — set msg.payload or the node message');
      }

      await api.whispers.sendWhisper(moderatorId, toUserId, message);
      return { fromUserId: moderatorId, toUserId, sent: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-channel-points',
    tier: 'extended',
    label: 'channel points',
    help: 'Lists, creates, updates or deletes custom Channel Points rewards.',
    scopes: ['channel:read:redemptions', 'channel:manage:redemptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's custom Channel Points rewards.",
        scopes: ['channel:read:redemptions'],
        fields: [
          { name: 'rewardIds', label: 'Reward IDs', kind: 'idList', default: '', aliases: ['ids'], hint: 'optional: comma separated reward IDs', faIcon: 'fa-gift' },
          { name: 'onlyManageable', label: 'Manageable only', kind: 'bool', default: false, faIcon: 'fa-lock' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'raise the cap to Max', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));

          const rewardIds = toIdList(firstDefined(msg.rewardIds, msg.ids, config.rewardIds));
          if (rewardIds.length) {
            const rewards = await api.channelPoints.getCustomRewardsByIds(broadcasterId, rewardIds);
            return { data: rewards, cursor: null, total: rewards.length };
          }

          const onlyManageable =
            toBool(firstDefined(msg.onlyManageable, config.onlyManageable), false) === true;
          const rewards = await api.channelPoints.getCustomRewards(broadcasterId, onlyManageable);
          const out = getAll ? rewards.slice(0, maxAll) : rewards.slice(0, limit);
          return { data: out, cursor: null, total: rewards.length, truncated: getAll && rewards.length > out.length };
        },
        map: (result) => result.data.map(mapReward),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a custom Channel Points reward. Only the fields you set are sent.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-gift' },
          { name: 'cost', label: 'Cost', kind: 'int', default: '', hint: 'channel points, required', faIcon: 'fa-star' },
          { name: 'prompt', label: 'Prompt', kind: 'string', default: '', hint: 'optional', faIcon: 'fa-comment' },
          {
            name: 'enabled',
            label: 'Enabled',
            kind: 'select',
            default: '',
            aliases: ['isEnabled'],
            faIcon: 'fa-toggle-on',
            options: triState('default (on)', 'on', 'off'),
          },
          { name: 'backgroundColor', label: 'Background', kind: 'string', default: '', hint: 'optional: #9147ff', faIcon: 'fa-paint-brush' },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: triState('default', 'yes', 'no'),
          },
          { name: 'maxRedemptionsPerStream', label: 'Max per stream', kind: 'int', default: '', hint: 'blank = no limit', faIcon: 'fa-repeat' },
          { name: 'maxRedemptionsPerUserPerStream', label: 'Max per user', kind: 'int', default: '', hint: 'blank = no limit', faIcon: 'fa-user' },
          { name: 'globalCooldown', label: 'Cooldown (s)', kind: 'int', default: '', hint: 'blank = no cooldown', faIcon: 'fa-clock-o' },
          {
            name: 'autoFulfill',
            label: 'Auto-fulfil',
            kind: 'select',
            default: '',
            faIcon: 'fa-check',
            options: triState('default (off)', 'on', 'off'),
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A reward title is required — set msg.payload or the node title');

          const cost = input.cost;
          if (cost === undefined || cost < 1) {
            throw new Error('A reward cost is required — set a positive number of channel points');
          }

          const data: any = { title, cost };
          if (input.prompt !== undefined) data.prompt = input.prompt;
          if (input.enabled !== undefined) data.isEnabled = toBool(input.enabled);
          if (input.backgroundColor !== undefined) data.backgroundColor = input.backgroundColor;
          if (input.userInputRequired !== undefined) data.userInputRequired = toBool(input.userInputRequired);
          if (input.maxRedemptionsPerStream !== undefined) data.maxRedemptionsPerStream = input.maxRedemptionsPerStream;
          if (input.maxRedemptionsPerUserPerStream !== undefined) {
            data.maxRedemptionsPerUserPerStream = input.maxRedemptionsPerUserPerStream;
          }
          if (input.globalCooldown !== undefined) data.globalCooldown = input.globalCooldown;
          if (input.autoFulfill !== undefined) data.autoFulfill = toBool(input.autoFulfill);

          const reward = await api.channelPoints.createCustomReward(broadcasterId, data);
          return mapReward(reward);
        },
      },
      update: {
        label: 'update',
        help: 'Updates a custom Channel Points reward. Only the fields you set are sent.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          rewardIdField,
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'leave blank to keep; msg.payload overrides', faIcon: 'fa-font' },
          { name: 'cost', label: 'Cost', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-star' },
          { name: 'prompt', label: 'Prompt', kind: 'string', default: '', hint: 'leave blank to keep', faIcon: 'fa-comment' },
          { name: 'enabled', label: 'Enabled', kind: 'select', default: '', aliases: ['isEnabled'], faIcon: 'fa-toggle-on', options: enableOptions },
          {
            name: 'paused',
            label: 'Paused',
            kind: 'select',
            default: '',
            aliases: ['isPaused'],
            faIcon: 'fa-pause',
            options: triState('leave unchanged', 'paused', 'running'),
          },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: triState('leave unchanged', 'yes', 'no'),
          },
          { name: 'backgroundColor', label: 'Background', kind: 'string', default: '', hint: 'leave blank to keep', faIcon: 'fa-paint-brush' },
          { name: 'maxRedemptionsPerStream', label: 'Max per stream', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-repeat' },
          { name: 'maxRedemptionsPerUserPerStream', label: 'Max per user', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-user' },
          { name: 'globalCooldown', label: 'Cooldown (s)', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-clock-o' },
          { name: 'autoFulfill', label: 'Auto-fulfil', kind: 'select', default: '', faIcon: 'fa-check', options: enableOptions },
        ],
        run: async ({ api, broadcasterId, input, raw, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const data: any = {};
          if (input.title !== undefined) data.title = input.title;

          if (raw.cost !== undefined) {
            const cost = toInt(raw.cost);
            if (cost === undefined || cost < 1) {
              throw new Error('Reward cost must be a positive number of channel points');
            }
            data.cost = cost;
          }

          if (input.prompt !== undefined) data.prompt = input.prompt;
          if (input.enabled !== undefined) data.isEnabled = toBool(input.enabled);
          if (input.backgroundColor !== undefined) data.backgroundColor = input.backgroundColor;
          if (input.userInputRequired !== undefined) data.userInputRequired = toBool(input.userInputRequired);
          if (input.maxRedemptionsPerStream !== undefined) data.maxRedemptionsPerStream = input.maxRedemptionsPerStream;
          if (input.maxRedemptionsPerUserPerStream !== undefined) {
            data.maxRedemptionsPerUserPerStream = input.maxRedemptionsPerUserPerStream;
          }
          if (input.globalCooldown !== undefined) data.globalCooldown = input.globalCooldown;
          if (input.autoFulfill !== undefined) data.autoFulfill = toBool(input.autoFulfill);
          if (input.paused !== undefined) data.isPaused = toBool(input.paused);

          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set at least one reward field');
          }

          const reward = await api.channelPoints.updateCustomReward(broadcasterId, rewardId, data);
          return mapReward(reward);
        },
      },
      delete: {
        label: 'delete',
        help: 'Deletes a custom Channel Points reward.',
        scopes: ['channel:manage:redemptions'],
        fields: [rewardIdField],
        run: async ({ api, broadcasterId, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          await api.channelPoints.deleteCustomReward(broadcasterId, rewardId);
          return { rewardId, deleted: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-redemptions',
    tier: 'extended',
    label: 'redemptions',
    help: 'Lists custom Channel Points redemptions or updates their status.',
    scopes: ['channel:read:redemptions', 'channel:manage:redemptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists redemptions of a custom Channel Points reward, newest first by default.',
        scopes: ['channel:read:redemptions'],
        paged: { limit: 20 },
        fields: [
          rewardIdField,
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'unfulfilled (default)' },
              { value: 'UNFULFILLED', label: 'unfulfilled' },
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CANCELED', label: 'canceled' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const status = (toStr(firstDefined(msg.status, config.status)) ?? 'UNFULFILLED').toUpperCase();
          if (REDEMPTION_STATUSES.indexOf(status) === -1) {
            throw new Error(`Status must be one of ${REDEMPTION_STATUSES.join(', ')}`);
          }

          const newestFirst = toBool(firstDefined(msg.newestFirst, config.newestFirst));
          const filter: any = { limit: input.limit, after: input.after };
          if (newestFirst !== undefined) filter.newestFirst = newestFirst;

          return api.channelPoints.getRedemptionsForBroadcaster(broadcasterId, rewardId, status, filter);
        },
        map: (redemption) => mapRedemption(redemption),
      },
      update: {
        label: 'update',
        help: 'Marks one or more custom reward redemptions as fulfilled or canceled.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          rewardIdField,
          { name: 'redemptionIds', label: 'Redemption IDs', kind: 'idList', default: '', hint: 'comma separated, required', faIcon: 'fa-tags' },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-check',
            options: [
              { value: '', label: 'fulfilled (default)' },
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CANCELED', label: 'canceled' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const redemptionIds = toIdList(
            firstDefined(msg.redemptionIds, msg.redemptionId, msg.id, config.redemptionIds)
          );
          if (!redemptionIds.length) {
            throw new Error('A redemption ID is required — set msg.redemptionId or the node field');
          }

          const status = (toStr(firstDefined(msg.status, config.status)) ?? 'FULFILLED').toUpperCase();
          if (TARGET_STATUSES.indexOf(status) === -1) {
            throw new Error('Status must be either FULFILLED or CANCELED');
          }

          const updated = await api.channelPoints.updateRedemptionStatusByIds(
            broadcasterId,
            rewardId,
            redemptionIds,
            status
          );
          return updated.map(mapRedemption);
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-polls',
    tier: 'extended',
    label: 'polls',
    help: 'Lists, creates or ends a channel poll.',
    scopes: ['channel:read:polls', 'channel:manage:polls'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's polls, most recent first, or fetches specific polls.",
        scopes: ['channel:read:polls'],
        fields: [
          { name: 'pollIds', label: 'Poll IDs', kind: 'idList', default: '', aliases: ['ids', 'pollId', 'id'], hint: 'optional: comma separated poll IDs', faIcon: 'fa-bar-chart' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'follows pages up to the maximum', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const pollIds = toIdList(firstDefined(msg.pollIds, msg.ids, msg.pollId, msg.id, config.pollIds));
          if (pollIds.length) {
            const polls = await api.polls.getPollsByIds(broadcasterId, pollIds);
            return { data: polls, cursor: null, total: polls.length };
          }

          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const after = firstDefined(msg.after, msg.cursor);
          const fetchPage = async (cursor?: string) => {
            const res = await api.polls.getPolls(broadcasterId, { limit, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total, truncated: getAll && !!result.cursor };
        },
        map: (result) => result.data.map(mapPoll),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a channel poll with 2 to 5 choices.',
        scopes: ['channel:manage:polls'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-bar-chart' },
          { name: 'choices', label: 'Choices', kind: 'string', default: '', hint: 'comma separated, 2 to 5', faIcon: 'fa-list' },
          { name: 'duration', label: 'Duration (s)', kind: 'int', default: '', hint: '15 to 1800, required', faIcon: 'fa-clock-o' },
          { name: 'channelPointsPerVote', label: 'Points per vote', kind: 'int', default: '', hint: 'optional: 0 = disabled', faIcon: 'fa-star' },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A poll title is required — set msg.payload or the node title');

          const choices = toStringList(firstDefined(msg.choices, msg.options, config.choices));
          if (choices.length < 2 || choices.length > 5) {
            throw new Error('A poll needs 2 to 5 choices — set msg.choices or the node field');
          }

          const duration = toInt(firstDefined(msg.duration, msg.durationSeconds, config.duration));
          if (duration === undefined || duration < 15 || duration > 1800) {
            throw new Error('A poll duration of 15 to 1800 seconds is required');
          }

          const data: any = { title, choices, duration };
          if (input.channelPointsPerVote !== undefined) data.channelPointsPerVote = input.channelPointsPerVote;

          const poll = await api.polls.createPoll(broadcasterId, data);
          return mapPoll(poll);
        },
      },
      end: {
        label: 'end',
        help: 'Ends an active channel poll, optionally hiding the result from viewers.',
        scopes: ['channel:manage:polls'],
        fields: [
          { name: 'pollId', label: 'Poll ID', kind: 'string', default: '', hint: 'required', faIcon: 'fa-bar-chart' },
          {
            name: 'showResult',
            label: 'Show result',
            kind: 'select',
            default: '',
            faIcon: 'fa-eye',
            options: triState('default (show)', 'show', 'hide'),
          },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const pollId = toStr(firstDefined(msg.pollId, msg.id, config.pollId));
          if (!pollId) throw new Error('A poll ID is required — set msg.pollId or the node field');

          const showResult = toBool(firstDefined(msg.showResult, config.showResult), true) === true;

          const poll = await api.polls.endPoll(broadcasterId, pollId, showResult);
          return mapPoll(poll);
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-predictions',
    tier: 'extended',
    label: 'predictions',
    help: 'Lists, creates or ends a channel prediction.',
    scopes: ['channel:read:predictions', 'channel:manage:predictions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's predictions, most recent first, or fetches specific predictions.",
        scopes: ['channel:read:predictions'],
        fields: [
          { name: 'predictionIds', label: 'Prediction IDs', kind: 'idList', default: '', aliases: ['ids', 'predictionId', 'id'], hint: 'optional: comma separated prediction IDs', faIcon: 'fa-trophy' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'follows pages up to the maximum', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const predictionIds = toIdList(
            firstDefined(msg.predictionIds, msg.ids, msg.predictionId, msg.id, config.predictionIds)
          );
          if (predictionIds.length) {
            const predictions = await api.predictions.getPredictionsByIds(broadcasterId, predictionIds);
            return { data: predictions, cursor: null, total: predictions.length };
          }

          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const after = firstDefined(msg.after, msg.cursor);
          const fetchPage = async (cursor?: string) => {
            const res = await api.predictions.getPredictions(broadcasterId, { limit, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total, truncated: getAll && !!result.cursor };
        },
        map: (result) => result.data.map(mapPrediction),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a channel prediction with 2 to 10 outcomes.',
        scopes: ['channel:manage:predictions'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-trophy' },
          { name: 'outcomes', label: 'Outcomes', kind: 'string', default: '', hint: 'comma separated, 2 to 10', faIcon: 'fa-list' },
          { name: 'autoLockAfter', label: 'Lock after (s)', kind: 'int', default: '', hint: '1 to 1800, required', faIcon: 'fa-clock-o' },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A prediction title is required — set msg.payload or the node title');

          const outcomes = toStringList(firstDefined(msg.outcomes, msg.options, config.outcomes));
          if (outcomes.length < 2 || outcomes.length > 10) {
            throw new Error('A prediction needs 2 to 10 outcomes — set msg.outcomes or the node field');
          }

          const autoLockAfter = toInt(firstDefined(msg.autoLockAfter, msg.duration, config.autoLockAfter));
          if (autoLockAfter === undefined || autoLockAfter < 1 || autoLockAfter > 1800) {
            throw new Error('An auto-lock time of 1 to 1800 seconds is required');
          }

          const prediction = await api.predictions.createPrediction(broadcasterId, {
            title,
            outcomes,
            autoLockAfter,
          });
          return mapPrediction(prediction);
        },
      },
      end: {
        label: 'end',
        help: 'Ends a channel prediction by resolving it with a winning outcome or cancelling it.',
        scopes: ['channel:manage:predictions'],
        fields: [
          { name: 'predictionId', label: 'Prediction ID', kind: 'string', default: '', hint: 'required', faIcon: 'fa-trophy' },
          {
            name: 'result',
            label: 'Result',
            kind: 'select',
            default: 'resolve',
            faIcon: 'fa-flag-checkered',
            options: [
              { value: 'resolve', label: 'resolve with a winner' },
              { value: 'cancel', label: 'cancel' },
            ],
          },
          { name: 'outcome', label: 'Winning outcome', kind: 'string', default: '', hint: 'outcome ID or title, required to resolve', faIcon: 'fa-check' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const predictionId = toStr(firstDefined(msg.predictionId, msg.id, config.predictionId));
          if (!predictionId) {
            throw new Error('A prediction ID is required — set msg.predictionId or the node field');
          }

          const action = (toStr(firstDefined(msg.result, msg.action, config.result)) ?? 'resolve').toLowerCase();
          if (action !== 'resolve' && action !== 'cancel') {
            throw new Error('Prediction result must be either "resolve" or "cancel"');
          }

          if (action === 'cancel') {
            const canceled = await api.predictions.cancelPrediction(broadcasterId, predictionId);
            return mapPrediction(canceled);
          }

          let outcomeId = toStr(firstDefined(msg.outcome, msg.outcomeId, config.outcome));
          if (!outcomeId) {
            throw new Error('An outcome is required to resolve a prediction — set the winning outcome');
          }

          if (!/^\d+$/.test(outcomeId)) {
            const wanted = outcomeId.toLowerCase();
            const prediction = await api.predictions.getPredictionById(broadcasterId, predictionId);
            if (!prediction) throw new Error(`Prediction "${predictionId}" could not be found`);
            const match = (prediction.outcomes ?? []).find(
              (outcome: any) => outcome.id === outcomeId || String(outcome.title).toLowerCase() === wanted
            );
            if (!match) throw new Error(`Outcome "${outcomeId}" was not found on that prediction`);
            outcomeId = match.id;
          }

          const resolved = await api.predictions.resolvePrediction(broadcasterId, predictionId, outcomeId);
          return mapPrediction(resolved);
        },
      },
    },
  }),
];
