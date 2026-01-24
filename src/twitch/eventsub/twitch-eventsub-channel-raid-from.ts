// twitch-eventsub-channel-raid-from.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {
  
  class TwitchEventSubChannelRaidFromNode extends BaseTwitchEventsubNode {
    
    constructor(config: any) {
        super(RED, config);
        this.subscriptionType = 'channelRaidFrom';
    }

    mapEvent(event: any) {
      return {
        fromBroadcasterId: event.raidingBroadcasterId || event.fromBroadcasterId || event.broadcasterId,
        fromBroadcasterName: event.raidingBroadcasterName || event.fromBroadcasterName || event.broadcasterName,
        fromBroadcasterDisplayName: event.raidingBroadcasterDisplayName || event.fromBroadcasterDisplayName || event.broadcasterDisplayName,
        toBroadcasterId: event.toBroadcasterId,
        toBroadcasterName: event.toBroadcasterName,
        toBroadcasterDisplayName: event.toBroadcasterDisplayName,
        viewers: event.viewers,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-raid-from', TwitchEventSubChannelRaidFromNode);
};