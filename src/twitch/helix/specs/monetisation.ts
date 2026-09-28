import { getRawData } from '@twurple/common';
import { defineHelix, type HelixField } from '../define';
import { broadcaster } from './common';
import {
  clampLimit,
  firstDefined,
  resolveGameId,
  toBool,
  toStr,
} from '../twitch-helix-utils';

const PERIODS = ['day', 'week', 'month', 'year', 'all'];

const segmentId: HelixField = {
  name: 'segmentId',
  label: 'Segment ID',
  kind: 'string',
  required: true,
  aliases: ['id'],
  faIcon: 'fa-hashtag',
};

function mapBitsEntry(entry: any) {
  return {
    userId: entry.userId,
    userName: entry.userName,
    userDisplayName: entry.userDisplayName,
    rank: entry.rank,
    amount: entry.amount,
  };
}

function mapGoal(goal: any) {
  return {
    id: goal.id,
    broadcasterId: goal.broadcasterId,
    broadcasterName: goal.broadcasterName,
    broadcasterDisplayName: goal.broadcasterDisplayName,
    type: goal.type,
    description: goal.description,
    currentAmount: goal.currentAmount,
    targetAmount: goal.targetAmount,
    creationDate: goal.creationDate,
  };
}

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
    members: (team.userRelations ?? []).map((relation: any) => ({
      id: relation.id,
      name: relation.name,
      displayName: relation.displayName,
    })),
  };
}

function mapSegment(segment: any) {
  return {
    id: segment.id,
    startDate: segment.startDate,
    endDate: segment.endDate,
    title: segment.title,
    cancelEndDate: segment.cancelEndDate ?? null,
    categoryId: segment.categoryId ?? null,
    categoryName: segment.categoryName ?? null,
    isRecurring: segment.isRecurring,
  };
}

function mapSubscription(sub: any) {
  return {
    userId: sub.userId,
    userName: sub.userName,
    userDisplayName: sub.userDisplayName,
    broadcasterId: sub.broadcasterId,
    broadcasterName: sub.broadcasterName,
    broadcasterDisplayName: sub.broadcasterDisplayName,
    gifterId: sub.gifterId ?? null,
    gifterName: sub.gifterName ?? null,
    gifterDisplayName: sub.gifterDisplayName ?? null,
    isGift: sub.isGift,
    tier: sub.tier,
  };
}

function mapContribution(contribution: any) {
  return {
    userId: contribution.userId,
    type: contribution.type,
    total: contribution.total,
  };
}

function mapHypeTrainEvent(event: any) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventVersion: event.eventVersion,
    id: event.id,
    broadcasterId: event.broadcasterId,
    level: event.level,
    total: event.total,
    goal: event.goal,
    startDate: event.startDate,
    expiryDate: event.expiryDate,
    cooldownDate: event.cooldownDate,
    lastContribution: mapContribution(event.lastContribution),
    topContributions: (event.topContributions ?? []).map(mapContribution),
  };
}

function mapCharityAmount(amount: any) {
  if (!amount) return null;
  return {
    value: amount.value,
    decimalPlaces: amount.decimalPlaces,
    localizedValue: amount.localizedValue,
    currency: amount.currency,
  };
}

export const monetisationSpecs = [
  defineHelix({
    type: 'twitch-helix-bits',
    group: 'bits',
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
    group: 'subscriptions',
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
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            primary: true,
            aliases: ['userId'],
            faIcon: 'fa-search',
            hint: 'blank = authenticated user',
          },
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
    group: 'schedule',
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
            options: [
              { value: '', label: 'no' },
              { value: 'true', label: 'weekly' },
              { value: 'false', label: 'no' },
            ],
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
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'yes' },
              { value: 'false', label: 'no' },
            ],
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
    group: 'teams',
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
    group: 'charity',
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
    group: 'hype train',
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
    group: 'goals',
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
    group: 'whispers',
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
];
