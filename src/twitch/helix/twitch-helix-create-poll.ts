import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toInt,
  toStr,
} from './twitch-helix-utils';

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
  function TwitchHelixCreatePollNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:polls']);

      const title = toStr(
        firstDefined(
          msg.title,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.pollTitle,
          nodeConfig.title
        )
      );
      if (!title) throw new Error('A poll title is required — set msg.payload or the node title');

      const choices = toStringList(firstDefined(msg.choices, msg.options, nodeConfig.choices));
      if (choices.length < 2 || choices.length > 5) {
        throw new Error('A poll needs 2 to 5 choices — set msg.choices or the node field');
      }

      const duration = toInt(firstDefined(msg.duration, msg.durationSeconds, nodeConfig.duration));
      if (duration === undefined || duration < 15 || duration > 1800) {
        throw new Error('A poll duration of 15 to 1800 seconds is required');
      }

      const data: any = { title, choices, duration };
      const channelPointsPerVote = toInt(
        firstDefined(msg.channelPointsPerVote, nodeConfig.channelPointsPerVote)
      );
      if (channelPointsPerVote !== undefined) data.channelPointsPerVote = channelPointsPerVote;

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const authId = authUserId(twitchConfig);

      const poll = await apiClient.asUser(authId, (ctx: any) =>
        ctx.polls.createPoll(broadcasterId, data)
      );

      return mapPoll(poll);
    });
  }

  (TwitchHelixCreatePollNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-poll', TwitchHelixCreatePollNode as any);
};
