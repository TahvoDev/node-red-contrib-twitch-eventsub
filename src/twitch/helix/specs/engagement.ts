import { defineHelix, type HelixField } from '../define';
import {
  clampLimit,
  fetchAllPages,
  firstDefined,
  toBool,
  toIdList,
  toInt,
  toStr,
} from '../twitch-helix-utils';

const REDEMPTION_STATUSES = ['UNFULFILLED', 'FULFILLED', 'CANCELED'];
const TARGET_STATUSES = ['FULFILLED', 'CANCELED'];

const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

function imageUrl(reward: any, scale: number): string | null {
  try {
    return typeof reward.getImageUrl === 'function' ? reward.getImageUrl(scale) : null;
  } catch {
    return null;
  }
}

function mapReward(reward: any) {
  return {
    id: reward.id,
    broadcasterId: reward.broadcasterId,
    broadcasterName: reward.broadcasterName,
    broadcasterDisplayName: reward.broadcasterDisplayName,
    backgroundColor: reward.backgroundColor,
    isEnabled: reward.isEnabled,
    cost: reward.cost,
    title: reward.title,
    prompt: reward.prompt,
    userInputRequired: reward.userInputRequired,
    maxRedemptionsPerStream: reward.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: reward.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: reward.globalCooldown ?? null,
    isPaused: reward.isPaused,
    isInStock: reward.isInStock,
    redemptionsThisStream: reward.redemptionsThisStream ?? null,
    autoFulfill: reward.autoFulfill,
    cooldownExpiryDate: reward.cooldownExpiryDate ?? null,
    images: {
      url1x: imageUrl(reward, 1),
      url2x: imageUrl(reward, 2),
      url4x: imageUrl(reward, 4),
    },
  };
}

function mapRedemption(redemption: any) {
  return {
    id: redemption.id,
    broadcasterId: redemption.broadcasterId,
    broadcasterName: redemption.broadcasterName,
    broadcasterDisplayName: redemption.broadcasterDisplayName,
    userId: redemption.userId,
    userName: redemption.userName,
    userDisplayName: redemption.userDisplayName,
    userInput: redemption.userInput,
    isFulfilled: redemption.isFulfilled,
    isCanceled: redemption.isCanceled,
    redemptionDate: redemption.redemptionDate,
    rewardId: redemption.rewardId,
    rewardTitle: redemption.rewardTitle,
    rewardPrompt: redemption.rewardPrompt,
    rewardCost: redemption.rewardCost,
  };
}

function mapPoll(poll: any) {
  return {
    id: poll.id,
    broadcasterId: poll.broadcasterId,
    broadcasterName: poll.broadcasterName,
    broadcasterDisplayName: poll.broadcasterDisplayName,
    title: poll.title,
    isChannelPointsVotingEnabled: poll.isChannelPointsVotingEnabled,
    channelPointsPerVote: poll.channelPointsPerVote,
    status: poll.status,
    durationInSeconds: poll.durationInSeconds,
    startDate: poll.startDate,
    endDate: poll.endDate,
    choices: (poll.choices ?? []).map((choice: any) => ({
      id: choice.id,
      title: choice.title,
      totalVotes: choice.totalVotes,
      channelPointsVotes: choice.channelPointsVotes,
    })),
  };
}

function mapPrediction(prediction: any) {
  return {
    id: prediction.id,
    broadcasterId: prediction.broadcasterId,
    broadcasterName: prediction.broadcasterName,
    broadcasterDisplayName: prediction.broadcasterDisplayName,
    title: prediction.title,
    status: prediction.status,
    autoLockAfter: prediction.autoLockAfter,
    creationDate: prediction.creationDate,
    endDate: prediction.endDate ?? null,
    lockDate: prediction.lockDate ?? null,
    winningOutcomeId: prediction.winningOutcomeId ?? null,
    outcomes: (prediction.outcomes ?? []).map((outcome: any) => ({
      id: outcome.id,
      title: outcome.title,
      users: outcome.users,
      totalChannelPoints: outcome.totalChannelPoints,
      color: outcome.color,
      topPredictors: (outcome.topPredictors ?? []).map((predictor: any) => ({
        userId: predictor.userId,
        userName: predictor.userName,
        userDisplayName: predictor.userDisplayName,
        channelPointsUsed: predictor.channelPointsUsed,
        channelPointsWon: predictor.channelPointsWon ?? null,
      })),
    })),
  };
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) {
      const s = toStr(entry);
      if (s) out.push(s);
    }
    return out;
  }
  const text = toStr(value);
  if (!text) return [];
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const enableOptions = [
  { value: '', label: 'leave unchanged' },
  { value: 'true', label: 'on' },
  { value: 'false', label: 'off' },
];

const rewardIdField: HelixField = {
  name: 'rewardId',
  label: 'Reward ID',
  kind: 'string',
  default: '',
  hint: 'required',
  faIcon: 'fa-gift',
};

export const engagementSpecs = [
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
          { name: 'allMax', label: 'Max', kind: 'int', default: 1000, faIcon: 'fa-arrow-up' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = toInt(firstDefined(msg.allMax, config.allMax), 1000) ?? 1000;

          const rewardIds = toIdList(firstDefined(msg.rewardIds, msg.ids, config.rewardIds));
          if (rewardIds.length) {
            const rewards = await api.channelPoints.getCustomRewardsByIds(broadcasterId, rewardIds);
            return { data: rewards, cursor: null, total: rewards.length };
          }

          const onlyManageable =
            toBool(firstDefined(msg.onlyManageable, config.onlyManageable), false) === true;
          const rewards = await api.channelPoints.getCustomRewards(broadcasterId, onlyManageable);
          const out = getAll ? rewards.slice(0, maxAll) : rewards.slice(0, limit);
          return { data: out, cursor: null, total: rewards.length };
        },
        map: (result) => result.data.map(mapReward),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total }),
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
            options: [
              { value: '', label: 'default (on)' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
          },
          { name: 'backgroundColor', label: 'Background', kind: 'string', default: '', hint: 'optional: #9147ff', faIcon: 'fa-paint-brush' },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: [
              { value: '', label: 'default' },
              { value: 'true', label: 'yes' },
              { value: 'false', label: 'no' },
            ],
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
            options: [
              { value: '', label: 'default (off)' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
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
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'paused' },
              { value: 'false', label: 'running' },
            ],
          },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'yes' },
              { value: 'false', label: 'no' },
            ],
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
        paged: { limit: 20, max: 1000 },
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
          { name: 'allMax', label: 'Max', kind: 'int', default: 1000, faIcon: 'fa-arrow-up' },
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
          const maxAll = toInt(firstDefined(msg.allMax, config.allMax), 1000) ?? 1000;
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total };
        },
        map: (result) => result.data.map(mapPoll),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total }),
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
            options: [
              { value: '', label: 'default (show)' },
              { value: 'true', label: 'show' },
              { value: 'false', label: 'hide' },
            ],
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
          { name: 'allMax', label: 'Max', kind: 'int', default: 1000, faIcon: 'fa-arrow-up' },
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
          const maxAll = toInt(firstDefined(msg.allMax, config.allMax), 1000) ?? 1000;
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total };
        },
        map: (result) => result.data.map(mapPrediction),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total }),
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
