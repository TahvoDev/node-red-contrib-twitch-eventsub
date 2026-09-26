// twitch-eventsub-channel-shared-chat-session-end.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelSharedChatSessionEndNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSharedChatSessionEnd');
    }

    mapEvent(e: any) {
      return {
        sessionId:                  e.sessionId,
        broadcasterId:              e.broadcasterId,
        broadcasterName:            e.broadcasterName,
        broadcasterDisplayName:     e.broadcasterDisplayName,
        hostBroadcasterId:          e.hostBroadcasterId,
        hostBroadcasterName:        e.hostBroadcasterName,
        hostBroadcasterDisplayName: e.hostBroadcasterDisplayName,
        rawEvent:                   e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-shared-chat-session-end', TwitchEventsubChannelSharedChatSessionEndNode);
};
