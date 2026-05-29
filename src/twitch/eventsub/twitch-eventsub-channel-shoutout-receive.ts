import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelShoutoutReceiveNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelShoutoutReceive');
    }
    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        sendingBroadcasterId:   e.sendingBroadcasterId,
        sendingBroadcasterName: e.sendingBroadcasterName,
        sendingBroadcasterDisplayName: e.sendingBroadcasterDisplayName,
        viewerCount:            e.viewerCount,
        startDate:              e.startDate,
        rawEvent:               e,
      };
    }
  }
  RED.nodes.registerType('twitch-eventsub-channel-shoutout-receive', TwitchEventsubChannelShoutoutReceiveNode);
};
