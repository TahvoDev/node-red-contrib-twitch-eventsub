// twitch-eventsub-channel-redemption-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelRedemptionUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelRedemptionUpdate');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        input:                  e.input,
        status:                 e.status,
        rewardId:               e.rewardId,
        rewardTitle:            e.rewardTitle,
        rewardCost:             e.rewardCost,
        rewardPrompt:           e.rewardPrompt,
        redemptionDate:         e.redemptionDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-redemption-update', TwitchEventsubChannelRedemptionUpdateNode);
};
