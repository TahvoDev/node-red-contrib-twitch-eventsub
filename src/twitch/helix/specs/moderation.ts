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
};

export const moderationSpecs = [
  defineHelix({
    type: 'twitch-helix-ban-user',
    label: 'ban user',
    help: 'Bans or times out a user in a channel (duration in seconds, capped at two weeks).',
    scopes: ['moderator:manage:banned_users'],
    fields: [
      { ...target, hint: 'username or ID to ban', faIcon: 'fa-gavel' },
      { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'optional', faIcon: 'fa-comment' },
      { name: 'duration', label: 'Duration (seconds)', kind: 'int', default: '', hint: 'blank = permanent ban', faIcon: 'fa-hourglass-half' },
      broadcaster,
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
  }),

  defineHelix({
    type: 'twitch-helix-unban-user',
    label: 'unban user',
    help: 'Removes a ban or timeout from a user in a channel.',
    scopes: ['moderator:manage:banned_users'],
    fields: [
      { ...target, hint: 'username or ID to unban', faIcon: 'fa-unlock' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      await api.moderation.unbanUser(broadcasterId, input.user);
      return { broadcasterId, userId: input.user, unbanned: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-banned-users',
    label: 'get banned users',
    help: "Lists a channel's banned and timed-out users, optionally filtered to one user.",
    scopes: ['moderation:read'],
    fields: [
      { name: 'user', label: 'User', kind: 'user', optional: true, aliases: ['targetUserId', 'targetUser'], hint: 'optional: check one user', faIcon: 'fa-search' },
      broadcaster,
    ],
    paged: { limit: 20, max: 1000 },
    run: async ({ api, broadcasterId, input }) =>
      api.moderation.getBannedUsers(broadcasterId, {
        userId: input.user,
        limit: input.limit,
        after: input.after,
      }),
    map: (ban) => mapBan(ban),
  }),

  defineHelix({
    type: 'twitch-helix-get-moderators',
    label: 'get moderators',
    help: "Lists a channel's moderators, optionally filtered to one user.",
    scopes: ['moderation:read'],
    fields: [
      { name: 'user', label: 'User', kind: 'user', optional: true, aliases: ['targetUserId', 'targetUser'], hint: 'optional: check one user', faIcon: 'fa-search' },
      broadcaster,
    ],
    paged: { limit: 20, max: 1000 },
    run: async ({ api, broadcasterId, input }) =>
      api.moderation.getModerators(broadcasterId, {
        userId: input.user,
        limit: input.limit,
        after: input.after,
      }),
    map: (moderator) => mapModerator(moderator),
  }),

  defineHelix({
    type: 'twitch-helix-add-moderator',
    label: 'add moderator',
    help: 'Gives a user moderator status in a channel.',
    scopes: ['channel:manage:moderators'],
    fields: [
      { ...target, hint: 'username or ID to make moderator', faIcon: 'fa-shield' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      await api.moderation.addModerator(broadcasterId, input.user);
      return { broadcasterId, userId: input.user, added: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-remove-moderator',
    label: 'remove moderator',
    help: "Removes a user's moderator status in a channel.",
    scopes: ['channel:manage:moderators'],
    fields: [
      { ...target, hint: 'username or ID to demote', faIcon: 'fa-shield' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      await api.moderation.removeModerator(broadcasterId, input.user);
      return { broadcasterId, userId: input.user, removed: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-vips',
    label: 'get vips',
    help: "Lists a channel's VIPs.",
    scopes: ['channel:read:vips'],
    fields: [broadcaster],
    paged: { limit: 20, max: 1000 },
    run: async ({ api, broadcasterId, input }) =>
      api.channels.getVips(broadcasterId, { limit: input.limit, after: input.after }),
    map: (vip) => mapUserRelation(vip),
  }),

  defineHelix({
    type: 'twitch-helix-add-vip',
    label: 'add vip',
    help: 'Gives a user VIP status in a channel.',
    scopes: ['channel:manage:vips'],
    fields: [
      { ...target, hint: 'username or ID to make VIP', faIcon: 'fa-star' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      await api.channels.addVip(broadcasterId, input.user);
      return { broadcasterId, userId: input.user, added: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-remove-vip',
    label: 'remove vip',
    help: "Removes a user's VIP status in a channel.",
    scopes: ['channel:manage:vips'],
    fields: [
      { ...target, hint: 'username or ID to demote', faIcon: 'fa-star-o' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      await api.channels.removeVip(broadcasterId, input.user);
      return { broadcasterId, userId: input.user, removed: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-warn-user',
    label: 'warn user',
    help: 'Issues a warning to a user that they must acknowledge before chatting again.',
    scopes: ['moderator:manage:warnings'],
    fields: [
      { ...target, hint: 'username or ID to warn', faIcon: 'fa-exclamation-triangle' },
      { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'shown to the user', faIcon: 'fa-comment' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) =>
      api.moderation.warnUser(broadcasterId, input.user, input.reason ?? ''),
    map: (warning) => mapWarning(warning),
  }),

  defineHelix({
    type: 'twitch-helix-get-blocked-terms',
    label: 'get blocked terms',
    help: "Lists the terms blocked in a channel's chat.",
    scopes: ['moderator:read:blocked_terms'],
    fields: [broadcaster],
    paged: { limit: 20, max: 1000 },
    run: async ({ api, broadcasterId, input }) =>
      api.moderation.getBlockedTerms(broadcasterId, { limit: input.limit, after: input.after }),
    map: (term) => mapBlockedTerm(term),
  }),

  defineHelix({
    type: 'twitch-helix-add-blocked-term',
    label: 'add blocked term',
    help: 'Adds a blocked term to a channel; matching messages are held for review.',
    scopes: ['moderator:manage:blocked_terms'],
    fields: [
      { name: 'term', label: 'Term', kind: 'string', default: '', primary: true, required: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-ban' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) =>
      api.moderation.addBlockedTerm(broadcasterId, input.term),
    map: (result) => {
      const created = Array.isArray(result) ? result[0] : result;
      if (!created) throw new Error('Twitch did not confirm the blocked term');
      return mapBlockedTerm(created);
    },
  }),

  defineHelix({
    type: 'twitch-helix-remove-blocked-term',
    label: 'remove blocked term',
    help: "Removes a blocked term from a channel's chat.",
    scopes: ['moderator:manage:blocked_terms'],
    fields: [
      { name: 'termId', label: 'Term ID', kind: 'string', default: '', required: true, aliases: ['id'], hint: 'msg.termId or msg.id overrides this', faIcon: 'fa-hashtag' },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, moderatorId, input }) => {
      await api.moderation.removeBlockedTerm(broadcasterId, moderatorId, input.termId);
      return { broadcasterId, termId: input.termId, removed: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-check-automod-status',
    label: 'check automod status',
    help: 'Asks Twitch whether messages would be approved or held by AutoMod, without posting them.',
    scopes: ['moderation:read'],
    fields: [
      { name: 'message', label: 'Message', kind: 'string', default: '', primary: true, optional: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-comment' },
      broadcaster,
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
  }),
];
