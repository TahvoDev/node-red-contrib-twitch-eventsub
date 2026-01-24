// twitch-eventsub-channel-raid-to.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {
  
  class TwitchEventSubChannelRaidToNode extends BaseTwitchEventsubNode {
    
    constructor(config: any) {
        super(RED, config);
        this.subscriptionType = 'channelRaidTo';
    }

    mapEvent(event: any) {
      return {
        fromBroadcasterId: event.fromBroadcasterId,
        fromBroadcasterName: event.fromBroadcasterName,
        fromBroadcasterDisplayName: event.fromBroadcasterDisplayName,
        toBroadcasterId: event.raidedBroadcasterId || event.toBroadcasterId || event.broadcasterId,
        toBroadcasterName: event.raidedBroadcasterName || event.toBroadcasterName || event.broadcasterName,
        toBroadcasterDisplayName: event.raidedBroadcasterDisplayName || event.toBroadcasterDisplayName || event.broadcasterDisplayName,
        viewers: event.viewers,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-raid-to', TwitchEventSubChannelRaidToNode);
};