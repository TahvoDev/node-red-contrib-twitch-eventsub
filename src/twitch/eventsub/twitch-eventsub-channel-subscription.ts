module.exports = function(RED: any) {
  class TwitchEventSubChannelSubscriptionNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'channelSubscription'; }

    mapEvent(event: any) {
      return {
        userId: event.userId,
        userName: event.userName,
        userDisplayName: event.userDisplayName,
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        id: event.id,
        input: event.input,
        redemptionDate: event.redemptionDate,
        rewardCost: event.rewardCost,
        rewardId: event.rewardId,
        rewardPrompt: event.rewardPrompt,
        rewardTitle: event.rewardTitle,
        status: event.status,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-subscription',
    TwitchEventSubChannelSubscriptionNode
  );
};
