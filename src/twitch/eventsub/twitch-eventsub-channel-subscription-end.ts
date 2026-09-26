// twitch-eventsub-channel-subscription-end.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelSubscriptionEndNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSubscriptionEnd');
    }

    mapEvent(e: any) {
      return {
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        tier:                   e.tier,
        isGift:                 e.isGift,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-subscription-end', TwitchEventsubChannelSubscriptionEndNode);
};
