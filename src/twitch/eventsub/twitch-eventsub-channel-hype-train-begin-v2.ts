// twitch-eventsub-channel-hype-train-begin-v2.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelHypeTrainBeginV2Node extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelHypeTrainBeginV2');
    }

    mapEvent(e: any) {
      return {
        id:                      e.id,
        broadcasterId:           e.broadcasterId,
        broadcasterName:         e.broadcasterName,
        broadcasterDisplayName:  e.broadcasterDisplayName,
        type:                    e.type,
        level:                   e.level,
        total:                   e.total,
        progress:                e.progress,
        goal:                    e.goal,
        topContributors:         e.topContributors,
        isSharedTrain:           e.isSharedTrain,
        sharedTrainParticipants: e.sharedTrainParticipants,
        allTimeHighLevel:        e.allTimeHighLevel,
        allTimeHighTotal:        e.allTimeHighTotal,
        startDate:               e.startDate,
        expiryDate:              e.expiryDate,
        rawEvent:                e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-hype-train-begin-v2', TwitchEventsubChannelHypeTrainBeginV2Node);
};
