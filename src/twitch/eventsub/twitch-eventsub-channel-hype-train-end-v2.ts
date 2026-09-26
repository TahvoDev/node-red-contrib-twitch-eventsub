// twitch-eventsub-channel-hype-train-end-v2.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelHypeTrainEndV2Node extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelHypeTrainEndV2');
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
        topContributors:         e.topContributors,
        isSharedTrain:           e.isSharedTrain,
        sharedTrainParticipants: e.sharedTrainParticipants,
        startDate:               e.startDate,
        endDate:                 e.endDate,
        cooldownEndDate:         e.cooldownEndDate,
        rawEvent:                e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-hype-train-end-v2', TwitchEventsubChannelHypeTrainEndV2Node);
};
