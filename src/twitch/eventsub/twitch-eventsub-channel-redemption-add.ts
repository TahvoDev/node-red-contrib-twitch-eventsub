module.exports = function(RED: any) {
  class TwitchEventSubChannelRedemptionAddNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'channelRedemptionAdd'; }

    mapEvent(event: any) {
      const mapped = {
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
        rawEvent: event
      };

      return mapped;
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-redemption-add',
    TwitchEventSubChannelRedemptionAddNode
  );
};
