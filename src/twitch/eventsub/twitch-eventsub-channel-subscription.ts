import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventSubChannelSubscriptionNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSubscription');
    }

    mapEvent(event: any) {
      return {
        userId:                 event.userId,
        userName:               event.userName,
        userDisplayName:        event.userDisplayName,
        broadcasterId:          event.broadcasterId,
        broadcasterName:        event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        tier:                   event.tier, // '1000', '2000', or '3000'
        isGift:                 event.isGift ?? false,
        rawEvent:               event,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-subscription', TwitchEventSubChannelSubscriptionNode);
};
