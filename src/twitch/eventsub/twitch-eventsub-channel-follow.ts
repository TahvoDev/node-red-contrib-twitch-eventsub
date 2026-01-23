module.exports = function(RED: any) {
  class TwitchEventSubChannelFollowNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'channelFollow'; }

    mapEvent(event: any) {
      return {
        userId: event.userId,
        userName: event.userName,
        userDisplayName: event.userDisplayName,
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        followDate: event.followDate,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-follow', TwitchEventSubChannelFollowNode);
};
