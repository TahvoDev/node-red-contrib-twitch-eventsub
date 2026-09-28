import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toIdList,
  toInt,
} from './twitch-helix-utils';

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

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetPollsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:polls']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const pollIds = toIdList(firstDefined(msg.pollIds, msg.ids, msg.pollId, msg.id, nodeConfig.pollIds));
      if (pollIds.length) {
        const polls = await apiClient.asUser(authId, (ctx: any) =>
          ctx.polls.getPollsByIds(broadcasterId, pollIds)
        );
        return {
          payload: polls.map(mapPoll),
          extra: { pagination: { cursor: null }, total: polls.length },
        };
      }

      const limit = clampLimit(firstDefined(msg.limit, nodeConfig.limit), 20);
      const after = firstDefined(msg.after, msg.cursor);

      const fetchPage = async (cursor?: string) => {
        const res = await apiClient.asUser(authId, (ctx: any) =>
          ctx.polls.getPolls(broadcasterId, { limit, after: cursor ?? after })
        );
        return { data: res.data, cursor: res.cursor ?? null, total: res.total };
      };

      const getAll = toBool(firstDefined(msg.all, nodeConfig.all), false) === true;
      const maxAll = toInt(firstDefined(msg.allMax, nodeConfig.allMax), 1000) ?? 1000;
      const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

      return {
        payload: result.data.map(mapPoll),
        extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
      };
    });
  }

  (TwitchHelixGetPollsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-polls', TwitchHelixGetPollsNode as any);
};
