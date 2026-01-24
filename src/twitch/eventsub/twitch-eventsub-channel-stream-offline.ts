// twitch-eventsub-channel-stream-offline.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {
  
  class TwitchEventSubChannelStreamOfflineNode extends BaseTwitchEventsubNode {
    
    constructor(config: any) {
        super(RED, config);
        this.subscriptionType = 'streamOffline';
    }

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