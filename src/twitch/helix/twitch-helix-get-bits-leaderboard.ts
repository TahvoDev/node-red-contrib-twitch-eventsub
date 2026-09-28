import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  clampLimit,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  resolveUserId,
  toStr,
} from './twitch-helix-utils';

const PERIODS = ['day', 'week', 'month', 'year', 'all'];

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetBitsLeaderboardNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['bits:read']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const count = clampLimit(firstDefined(msg.count, msg.limit, nodeConfig.count), 20);

      const period = toStr(firstDefined(msg.period, nodeConfig.period));
      if (period && PERIODS.indexOf(period) === -1) {
        throw new Error(`period must be one of ${PERIODS.join(', ')}`);
      }

      const startDateText = toStr(
        firstDefined(msg.startDate, msg.startingDate, nodeConfig.startDate)
      );
      let startDate: Date | undefined;
      if (startDateText) {
        startDate = new Date(startDateText);
        if (Number.isNaN(startDate.getTime())) {
          throw new Error(`startDate "${startDateText}" is not a valid date`);
        }
      }

      const userValue = firstDefined(msg.user, msg.contextUser, nodeConfig.user);
      const contextUserId = toStr(userValue)
        ? await resolveUserId(apiClient, userValue)
        : undefined;

      const params: any = { count };
      if (period) params.period = period;
      if (startDate) params.startDate = startDate;
      if (contextUserId) params.contextUserId = contextUserId;

      const leaderboard = await apiClient.bits.getLeaderboard(broadcasterId, params);

      return {
        payload: leaderboard.entries.map(mapBitsEntry),
        extra: { pagination: { cursor: null }, total: leaderboard.totalCount },
      };
    });
  }

  function mapBitsEntry(entry: any) {
    return {
      userId: entry.userId,
      userName: entry.userName,
      userDisplayName: entry.userDisplayName,
      rank: entry.rank,
      amount: entry.amount,
    };
  }

  (TwitchHelixGetBitsLeaderboardNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-bits-leaderboard', TwitchHelixGetBitsLeaderboardNode as any);
};
