// twitch-eventsub-channel-goal-end.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelGoalEndNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelGoalEnd');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        type:                   e.type,
        description:            e.description,
        isAchieved:             e.isAchieved,
        currentAmount:          e.currentAmount,
        targetAmount:           e.targetAmount,
        startDate:              e.startDate,
        endDate:                e.endDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-goal-end', TwitchEventsubChannelGoalEndNode);
};
