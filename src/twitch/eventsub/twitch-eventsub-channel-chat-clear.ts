// twitch-eventsub-channel-chat-clear.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelChatClearNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelChatClear');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-clear', TwitchEventsubChannelChatClearNode);
};
