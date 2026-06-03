import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelShoutoutCreateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelShoutoutCreate');
    }
    mapEvent(e: any) {
      return {
        broadcasterId:              e.broadcasterId,
        broadcasterName:            e.broadcasterName,
        broadcasterDisplayName:     e.broadcasterDisplayName,
        moderatorId:                e.moderatorId,
        moderatorName:              e.moderatorName,
        moderatorDisplayName:       e.moderatorDisplayName,
        shoutedOutBroadcasterId:    e.shoutedOutBroadcasterId,
        shoutedOutBroadcasterName:  e.shoutedOutBroadcasterName,
        shoutedOutBroadcasterDisplayName: e.shoutedOutBroadcasterDisplayName,
        viewerCount:                e.viewerCount,
        startDate:                  e.startDate,
        rawEvent:                   e,
      };
    }
  }
  RED.nodes.registerType('twitch-eventsub-channel-shoutout-create', TwitchEventsubChannelShoutoutCreateNode);
};
