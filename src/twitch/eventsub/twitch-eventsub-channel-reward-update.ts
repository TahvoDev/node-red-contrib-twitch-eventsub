// twitch-eventsub-channel-reward-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelRewardUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelRewardUpdate');
    }

    mapEvent(e: any) {
      return {
        id:                             e.id,
        broadcasterId:                  e.broadcasterId,
        broadcasterName:                e.broadcasterName,
        broadcasterDisplayName:         e.broadcasterDisplayName,
        isEnabled:                      e.isEnabled,
        isPaused:                       e.isPaused,
        isInStock:                      e.isInStock,
        title:                          e.title,
        cost:                           e.cost,
        prompt:                         e.prompt,
        userInputRequired:              e.userInputRequired,
        autoApproved:                   e.autoApproved,
        cooldownExpiryDate:             e.cooldownExpiryDate,
        redemptionsThisStream:          e.redemptionsThisStream,
        maxRedemptionsPerStream:        e.maxRedemptionsPerStream,
        maxRedemptionsPerUserPerStream: e.maxRedemptionsPerUserPerStream,
        globalCooldown:                 e.globalCooldown,
        backgroundColor:                e.backgroundColor,
        rawEvent:                       e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-reward-update', TwitchEventsubChannelRewardUpdateNode);
};
