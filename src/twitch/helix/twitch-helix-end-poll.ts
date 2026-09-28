import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toStr,
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
  function TwitchHelixEndPollNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:polls']);

      const pollId = toStr(firstDefined(msg.pollId, msg.id, nodeConfig.pollId));
      if (!pollId) throw new Error('A poll ID is required — set msg.pollId or the node field');

      const showResult = toBool(firstDefined(msg.showResult, nodeConfig.showResult), true) === true;

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const poll = await apiClient.asUser(authId, (ctx: any) =>
        ctx.polls.endPoll(broadcasterId, pollId, showResult)
      );

      return mapPoll(poll);
    });
  }

  (TwitchHelixEndPollNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-end-poll', TwitchHelixEndPollNode as any);
};
