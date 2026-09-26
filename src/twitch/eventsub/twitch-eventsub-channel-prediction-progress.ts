// twitch-eventsub-channel-prediction-progress.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubPredictionProgressNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelPredictionProgress');
    }

    mapEvent(e: any) {
      return {
        id:                    e.id,
        broadcasterId:         e.broadcasterId,
        broadcasterName:       e.broadcasterName,
        broadcasterDisplayName:e.broadcasterDisplayName,
        title:                 e.title,
        status:                e.status ?? null,
        winningOutcomeId:      e.winningOutcomeId ?? null,
        outcomes: e.outcomes?.map((o: any) => ({
          id:            o.id,
          title:         o.title,
          color:         o.color,
          users:         o.users ?? 0,
          channelPoints: o.channelPoints ?? 0,
        })) ?? [],
        startDate:             e.startDate ?? null,
        lockDate:              e.lockDate ?? null,
        endDate:               e.endDate ?? null,
        rawEvent:              e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-prediction-progress', TwitchEventsubPredictionProgressNode);
};
