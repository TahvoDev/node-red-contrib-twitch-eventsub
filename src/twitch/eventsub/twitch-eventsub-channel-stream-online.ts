// twitch-eventsub-channel-stream-online.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function(RED: any) {

  class TwitchEventSubChannelStreamOnlineNode extends BaseTwitchEventsubNode {

    constructor(config: any) {
      // Pass the Node-RED instance and node config to the parent constructor
      super(RED, config);

      // Define the specific subscription type
      this.register('streamOnline');
    }

    mapEvent(event: any) {
      // Maps the Twurple EventSubStreamOnlineEvent perfectly to the Node-RED payload
      return {
        id: event.id,
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        startDate: event.startDate,
        type: event.type
      };
    }
  }

  RED.nodes.registerType(
    'twitch-eventsub-channel-stream-online',
    TwitchEventSubChannelStreamOnlineNode
  );
};
