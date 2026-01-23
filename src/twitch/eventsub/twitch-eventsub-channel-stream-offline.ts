module.exports = function(RED: any) {
  class TwitchEventSubChannelStreamOfflineNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'streamOffline'; }

    mapEvent(event: any) {
      return {
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        startDate: event.startDate,
        type: event.type,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-stream-offline',
    TwitchEventSubChannelStreamOfflineNode
  );
};
