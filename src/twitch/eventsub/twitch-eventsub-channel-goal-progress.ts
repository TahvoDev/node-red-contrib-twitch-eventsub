// twitch-eventsub-channel-goal-progress.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelGoalProgressNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelGoalProgress');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        type:                   e.type,
        description:            e.description,
        currentAmount:          e.currentAmount,
        targetAmount:           e.targetAmount,
        startDate:              e.startDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-goal-progress', TwitchEventsubChannelGoalProgressNode);
};
