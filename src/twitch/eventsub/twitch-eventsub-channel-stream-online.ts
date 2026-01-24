// twitch-eventsub-channel-stream-online.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {
  
  class TwitchEventSubChannelStreamOnlineNode extends BaseTwitchEventsubNode {
    
    constructor(config: any) {
        // Pass the Node-RED instance and node config to the parent constructor
        super(RED, config);
        
        // Define the specific subscription type
        this.subscriptionType = 'streamOnline';
    }

    mapEvent(event: any) {
      return {
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        id: event.id, // Twitch stream ID
        startDate: event.startDate,
        type: event.type,
        rawEvent: event,
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-stream-online',
    TwitchEventSubChannelStreamOnlineNode
  );
};