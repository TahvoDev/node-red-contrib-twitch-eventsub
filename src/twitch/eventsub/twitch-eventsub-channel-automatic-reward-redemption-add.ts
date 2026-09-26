// twitch-eventsub-channel-automatic-reward-redemption-add.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelAutomaticRewardRedemptionAddNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelAutomaticRewardRedemptionAdd');
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
        rewardType:             e.rewardType,
        rewardCost:             e.rewardCost,
        unlockedEmote:          e.unlockedEmote,
        input:                  e.input,
        messageText:            e.messageText,
        emoteOffsets:           e.emoteOffsets,
        redemptionDate:         e.redemptionDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-automatic-reward-redemption-add', TwitchEventsubChannelAutomaticRewardRedemptionAddNode);
};
