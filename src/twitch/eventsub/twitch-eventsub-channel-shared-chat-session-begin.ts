// twitch-eventsub-channel-shared-chat-session-begin.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelSharedChatSessionBeginNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSharedChatSessionBegin');
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
        participants:               e.participants,
        rawEvent:                   e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-shared-chat-session-begin', TwitchEventsubChannelSharedChatSessionBeginNode);
};
