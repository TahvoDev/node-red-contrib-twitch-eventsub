// twitch-eventsub-channel-subscription-gift.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {
  
  class TwitchEventSubChannelSubscriptionGiftNode extends BaseTwitchEventsubNode {
    
    constructor(config: any) {
        super(RED, config);
        this.subscriptionType = 'channelSubscriptionGift';
    }

    mapEvent(event: any) {
      return {
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,

        gifterId: event.gifterId,
        gifterName: event.gifterName,
        gifterDisplayName: event.gifterDisplayName,

        tier: event.tier,
        amount: event.amount,
        cumulativeAmount: event.cumulativeAmount,
        isAnonymous: event.isAnonymous,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-subscription-gift',
    TwitchEventSubChannelSubscriptionGiftNode
  );
};