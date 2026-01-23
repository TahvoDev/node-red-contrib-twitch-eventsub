module.exports = function(RED: any) {
  class TwitchEventSubChannelSubscriptionGiftNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'channelSubscriptionGift'; }

    mapEvent(event: any) {
      return {
        // Broadcaster info
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,

        // Gifter info
        gifterId: event.gifterId,
        gifterName: event.gifterName,
        gifterDisplayName: event.gifterDisplayName,

        // Subscription details
        tier: event.tier,
        amount: event.amount,
        cumulativeAmount: event.cumulativeAmount,
        isAnonymous: event.isAnonymous,

        // Raw event data
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-subscription-gift',
    TwitchEventSubChannelSubscriptionGiftNode
  );
};
