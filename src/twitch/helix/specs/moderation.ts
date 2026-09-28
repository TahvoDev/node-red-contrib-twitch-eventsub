import { defineHelix, type HelixField } from '../define';
import {
  firstDefined,
  MAX_TIMEOUT_SECONDS,
  mapAutoModStatus,
  mapBan,
  mapBlockedTerm,
  mapModerator,
  mapUserRelation,
  mapWarning,
  toBool,
  toStr,
} from '../twitch-helix-utils';

const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

const target: HelixField = {
  name: 'user',
  label: 'User',
  kind: 'user',
  required: true,
  aliases: ['targetUserId', 'targetUser'],
  hint: 'username or ID',
  faIcon: 'fa-user',
};

const optionalUser: HelixField = {
  name: 'user',
  label: 'User',
  kind: 'user',
  optional: true,
  aliases: ['targetUserId', 'targetUser'],
  hint: 'optional: check one user',
  faIcon: 'fa-search',
};

function mapAutoModSettings(settings: any) {
  return {
    broadcasterId: settings.broadcasterId,
    moderatorId: settings.moderatorId,
    overallLevel: settings.overallLevel ?? null,
    disability: settings.disability,
    aggression: settings.aggression,
    sexualitySexOrGender: settings.sexualitySexOrGender,
    misogyny: settings.misogyny,
    bullying: settings.bullying,
    swearing: settings.swearing,
    raceEthnicityOrReligion: settings.raceEthnicityOrReligion,
    sexBasedTerms: settings.sexBasedTerms,
  };
}

function mapShieldMode(status: any) {
  return {
    isActive: status.isActive,
    moderatorId: status.moderatorId,
    moderatorName: status.moderatorName,
    moderatorDisplayName: status.moderatorDisplayName,
    lastActivationDate: status.lastActivationDate ?? null,
  };
}

function mapUnbanRequest(request: any) {
  return {
    id: request.id,
    broadcasterId: request.broadcasterId,
    userId: request.userId,
    userName: request.userName,
    userDisplayName: request.userDisplayName,
    moderatorId: request.moderatorId ?? null,
    moderatorDisplayName: request.moderatorDisplayName ?? null,
    message: request.message,
    creationDate: request.creationDate,
    resolutionMessage: request.resolutionMessage ?? null,
    resolutionDate: request.resolutionDate ?? null,
  };
}

function mapModeratedChannel(channel: any) {
  return { id: channel.id, name: channel.name, displayName: channel.displayName };
}

/** The AutoMod category levels; 0-4, or blank to leave a category unchanged. */
const automodLevel = (name: string, label: string): HelixField => ({
  name,
  label,
  kind: 'int',
  default: '',
  hint: '0 to 4, blank = leave unchanged',
  faIcon: 'fa-sliders',
});

export const moderationSpecs = [
  defineHelix({
    type: 'twitch-helix-bans',
    tier: 'core',
    label: 'bans',
    help: 'Bans, times out, unbans or lists banned users in a channel. Leave Duration blank for a permanent ban.',
    scopes: ['moderator:manage:banned_users', 'moderation:read'],
    fields: [broadcaster],
    defaultAction: 'ban',
    actions: {
      ban: {
        label: 'ban / timeout',
        help: 'Bans or times out a user (duration in seconds, capped at two weeks).',
        scopes: ['moderator:manage:banned_users'],
        fields: [
          { ...target, hint: 'username or ID to ban', faIcon: 'fa-gavel' },
          { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'optional', faIcon: 'fa-comment' },
          { name: 'duration', label: 'Duration (seconds)', kind: 'int', default: '', hint: 'blank = permanent ban', faIcon: 'fa-hourglass-half' },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          let duration: number | undefined;
          if (raw.duration !== undefined) {
            const parsed = input.duration;
            if (parsed === undefined || parsed <= 0) {
              throw new Error('Duration must be a positive number of seconds, or blank for a permanent ban');
            }
            duration = Math.min(parsed, MAX_TIMEOUT_SECONDS);
          }
          return api.moderation.banUser(broadcasterId, {
            user: input.user,
            reason: input.reason ?? '',
            duration,
          });
        },
        map: (result) => {
          const ban = Array.isArray(result) ? result[0] : result;
          if (!ban) throw new Error('Twitch did not confirm the ban');
          return mapBan(ban);
        },
      },
      unban: {
        label: 'unban',
        help: 'Removes a ban or timeout from a user.',
        scopes: ['moderator:manage:banned_users'],
        fields: [{ ...target, hint: 'username or ID to unban', faIcon: 'fa-unlock' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.unbanUser(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, unbanned: true };
        },
      },
      list: {
        label: 'list',
        help: "Lists a channel's banned and timed-out users, optionally filtered to one user.",
        scopes: ['moderation:read'],
        paged: { limit: 20, max: 1000 },
        fields: [optionalUser],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getBannedUsers(broadcasterId, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (ban) => mapBan(ban),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-moderators',
    tier: 'extended',
    label: 'moderators',
    help: 'Lists, adds or removes a channel moderator.',
    scopes: ['moderation:read', 'channel:manage:moderators'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's moderators, optionally filtered to one user.",
        scopes: ['moderation:read'],
        paged: { limit: 20, max: 1000 },
        fields: [optionalUser],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getModerators(broadcasterId, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (moderator) => mapModerator(moderator),
      },
      add: {
        label: 'add',
        help: 'Gives a user moderator status in a channel.',
        scopes: ['channel:manage:moderators'],
        fields: [{ ...target, hint: 'username or ID to make moderator', faIcon: 'fa-shield' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.addModerator(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, added: true };
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a user's moderator status in a channel.",
        scopes: ['channel:manage:moderators'],
        fields: [{ ...target, hint: 'username or ID to demote', faIcon: 'fa-shield' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.removeModerator(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-vips',
    tier: 'extended',
    label: 'vips',
    help: 'Lists, adds or removes a channel VIP.',
    scopes: ['channel:read:vips', 'channel:manage:vips'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's VIPs.",
        scopes: ['channel:read:vips'],
        paged: { limit: 20, max: 1000 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.channels.getVips(broadcasterId, { limit: input.limit, after: input.after }),
        map: (vip) => mapUserRelation(vip),
      },
      add: {
        label: 'add',
        help: 'Gives a user VIP status in a channel.',
        scopes: ['channel:manage:vips'],
        fields: [{ ...target, hint: 'username or ID to make VIP', faIcon: 'fa-star' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.channels.addVip(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, added: true };
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a user's VIP status in a channel.",
        scopes: ['channel:manage:vips'],
        fields: [{ ...target, hint: 'username or ID to demote', faIcon: 'fa-star-o' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.channels.removeVip(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-blocked-terms',
    tier: 'extended',
    label: 'blocked terms',
    help: "Lists, adds or removes terms blocked in a channel's chat.",
    scopes: ['moderator:read:blocked_terms', 'moderator:manage:blocked_terms'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists the terms blocked in a channel's chat.",
        scopes: ['moderator:read:blocked_terms'],
        paged: { limit: 20, max: 1000 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getBlockedTerms(broadcasterId, { limit: input.limit, after: input.after }),
        map: (term) => mapBlockedTerm(term),
      },
      add: {
        label: 'add',
        help: 'Adds a blocked term to a channel; matching messages are held for review.',
        scopes: ['moderator:manage:blocked_terms'],
        fields: [
          { name: 'term', label: 'Term', kind: 'string', default: '', primary: true, required: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-ban' },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.addBlockedTerm(broadcasterId, input.term),
        map: (result) => {
          const created = Array.isArray(result) ? result[0] : result;
          if (!created) throw new Error('Twitch did not confirm the blocked term');
          return mapBlockedTerm(created);
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a blocked term from a channel's chat.",
        scopes: ['moderator:manage:blocked_terms'],
        fields: [
          { name: 'termId', label: 'Term ID', kind: 'string', default: '', required: true, aliases: ['id'], hint: 'msg.termId or msg.id overrides this', faIcon: 'fa-hashtag' },
        ],
        run: async ({ api, broadcasterId, moderatorId, input }) => {
          await api.moderation.removeBlockedTerm(broadcasterId, moderatorId, input.termId);
          return { broadcasterId, termId: input.termId, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-moderation',
    tier: 'extended',
    label: 'moderation tools',
    help: 'Warns a user or checks messages against AutoMod.',
    scopes: ['moderator:manage:warnings', 'moderation:read'],
    fields: [broadcaster],
    defaultAction: 'warn',
    actions: {
      warn: {
        label: 'warn',
        help: 'Issues a warning to a user that they must acknowledge before chatting again.',
        scopes: ['moderator:manage:warnings'],
        fields: [
          { ...target, hint: 'username or ID to warn', faIcon: 'fa-exclamation-triangle' },
          { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'shown to the user', faIcon: 'fa-comment' },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.warnUser(broadcasterId, input.user, input.reason ?? ''),
        map: (warning) => mapWarning(warning),
      },
      automod: {
        label: 'check automod',
        help: 'Asks Twitch whether messages would be approved or held by AutoMod, without posting them.',
        scopes: ['moderation:read'],
        fields: [
          { name: 'message', label: 'Message', kind: 'string', default: '', primary: true, optional: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-comment' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const raw = firstDefined(
            typeof msg.payload === 'string' || Array.isArray(msg.payload) ? msg.payload : undefined,
            msg.message,
            msg.text,
            config.message
          );
          const messages = (Array.isArray(raw) ? raw : [raw])
            .map((value: unknown) => toStr(value))
            .filter((value): value is string => Boolean(value));
          if (!messages.length) throw new Error('A message to check is required — set msg.payload');

          const data = messages.map((text: string, index: number) => ({
            messageId: `msg-${index + 1}`,
            messageText: text,
          }));
          return api.moderation.checkAutoModStatus(broadcasterId, data);
        },
        map: (result) => {
          const mapped = (result ?? []).map(mapAutoModStatus);
          return mapped.length === 1 ? mapped[0] : mapped;
        },
      },
      moderated: {
        label: 'moderated channels',
        help: 'Lists the channels a user moderates.',
        scopes: ['user:read:moderated_channels'],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'user',
            label: 'Moderator',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            hint: 'blank = authenticated user',
          },
        ],
        run: async ({ api, moderatorId, input }) =>
          api.moderation.getModeratedChannels(input.user ?? moderatorId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (channel) => mapModeratedChannel(channel),
      },
      checkBan: {
        label: 'check ban',
        help: 'Checks whether a user is banned in the channel.',
        scopes: ['moderation:read'],
        fields: [target],
        run: async ({ api, broadcasterId, input }) => ({
          userId: input.user,
          isBanned: await api.moderation.checkUserBan(broadcasterId, input.user),
        }),
      },
      checkMod: {
        label: 'check moderator',
        help: 'Checks whether a user is a moderator of the channel.',
        scopes: ['moderation:read'],
        fields: [target],
        run: async ({ api, broadcasterId, input }) => ({
          userId: input.user,
          isModerator: await api.moderation.checkUserMod(broadcasterId, input.user),
        }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-automod',
    tier: 'extended',
    label: 'automod',
    help: 'Reads or updates AutoMod settings, or approves/denies a held message.',
    scopes: [
      'moderator:read:automod_settings',
      'moderator:manage:automod_settings',
      'moderator:manage:automod',
    ],
    fields: [broadcaster],
    defaultAction: 'settings',
    actions: {
      settings: {
        label: 'get settings',
        help: 'Gets the AutoMod category levels for a channel.',
        scopes: ['moderator:read:automod_settings'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.moderation.getAutoModSettings(broadcasterId),
        map: (settings) => (settings ?? []).map(mapAutoModSettings),
      },
      update: {
        label: 'update settings',
        help: 'Changes the AutoMod category levels you set, leaving the rest unchanged.',
        scopes: ['moderator:manage:automod_settings'],
        fields: [
          automodLevel('overallLevel', 'Overall'),
          automodLevel('disability', 'Disability'),
          automodLevel('aggression', 'Aggression'),
          automodLevel('sexualitySexOrGender', 'Sexuality / sex / gender'),
          automodLevel('misogyny', 'Misogyny'),
          automodLevel('bullying', 'Bullying'),
          automodLevel('swearing', 'Swearing'),
          automodLevel('raceEthnicityOrReligion', 'Race / ethnicity / religion'),
          automodLevel('sexBasedTerms', 'Sex-based terms'),
        ],
        run: async ({ api, broadcasterId, input }) => {
          const data: any = {};
          for (const key of [
            'overallLevel',
            'disability',
            'aggression',
            'sexualitySexOrGender',
            'misogyny',
            'bullying',
            'swearing',
            'raceEthnicityOrReligion',
            'sexBasedTerms',
          ]) {
            if (input[key] !== undefined) data[key] = input[key];
          }
          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set at least one AutoMod level');
          }
          const settings = await api.moderation.updateAutoModSettings(broadcasterId, data);
          return (settings ?? []).map(mapAutoModSettings);
        },
      },
      held: {
        label: 'held message',
        help: 'Approves or denies a message AutoMod is holding.',
        scopes: ['moderator:manage:automod'],
        fields: [
          {
            name: 'messageId',
            label: 'Message ID',
            kind: 'string',
            default: '',
            required: true,
            aliases: ['id'],
            hint: 'msg.messageId or msg.id overrides this',
            faIcon: 'fa-comment-o',
          },
          {
            name: 'allow',
            label: 'Decision',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'approve' },
              { value: 'false', label: 'deny' },
            ],
          },
        ],
        run: async ({ api, moderatorId, input, msg }) => {
          const messageId = input.messageId ?? toStr(msg.id);
          if (!messageId) throw new Error('A message ID is required — set msg.messageId or msg.id');
          const allow = toBool(input.allow, true) === true;
          await api.moderation.processHeldAutoModMessage(moderatorId, messageId, allow);
          return { messageId, allow };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-shield-mode',
    tier: 'extended',
    label: 'shield mode',
    help: 'Reads or toggles Shield Mode on a channel.',
    scopes: ['moderator:read:shield_mode', 'moderator:manage:shield_mode'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Gets the current Shield Mode status.',
        scopes: ['moderator:read:shield_mode'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.moderation.getShieldModeStatus(broadcasterId),
        map: (status) => mapShieldMode(status),
      },
      update: {
        label: 'update',
        help: 'Activates or deactivates Shield Mode.',
        scopes: ['moderator:manage:shield_mode'],
        fields: [
          {
            name: 'active',
            label: 'Shield mode',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'activate' },
              { value: 'false', label: 'deactivate' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.updateShieldModeStatus(broadcasterId, toBool(input.active, true) === true),
        map: (status) => mapShieldMode(status),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-unban-requests',
    tier: 'extended',
    label: 'unban requests',
    help: 'Lists or resolves unban requests for a channel.',
    scopes: ['moderator:read:unban_requests', 'moderator:manage:unban_requests'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists unban requests with a given status.',
        scopes: ['moderator:read:unban_requests'],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: 'pending',
            faIcon: 'fa-filter',
            options: [
              { value: 'pending', label: 'pending' },
              { value: 'approved', label: 'approved' },
              { value: 'denied', label: 'denied' },
              { value: 'acknowledged', label: 'acknowledged' },
              { value: 'canceled', label: 'canceled' },
            ],
          },
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            faIcon: 'fa-search',
            hint: 'optional: filter to one user',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getUnbanRequests(broadcasterId, input.status, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (request) => mapUnbanRequest(request),
      },
      resolve: {
        label: 'resolve',
        help: 'Approves or denies an unban request, with an optional message.',
        scopes: ['moderator:manage:unban_requests'],
        fields: [
          {
            name: 'requestId',
            label: 'Request ID',
            kind: 'string',
            default: '',
            required: true,
            aliases: ['id'],
            hint: 'msg.unbanRequestId or msg.id overrides this',
            faIcon: 'fa-hashtag',
          },
          {
            name: 'approve',
            label: 'Decision',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'approve' },
              { value: 'false', label: 'deny' },
            ],
          },
          {
            name: 'message',
            label: 'Resolution message',
            kind: 'string',
            default: '',
            hint: 'optional',
            faIcon: 'fa-comment',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.resolveUnbanRequest(
            broadcasterId,
            input.requestId,
            toBool(input.approve, true) === true,
            input.message || undefined
          ),
        map: (request) => mapUnbanRequest(request),
      },
    },
  }),
];
