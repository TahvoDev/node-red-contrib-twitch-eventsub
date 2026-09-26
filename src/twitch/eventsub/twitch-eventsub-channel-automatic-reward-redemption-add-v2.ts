// twitch-eventsub-channel-automatic-reward-redemption-add-v2.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelAutomaticRewardRedemptionAddV2Node extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelAutomaticRewardRedemptionAddV2');
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
        reward:                 e.reward,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        redemptionDate:         e.redemptionDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-automatic-reward-redemption-add-v2', TwitchEventsubChannelAutomaticRewardRedemptionAddV2Node);
};
