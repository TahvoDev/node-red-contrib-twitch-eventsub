// twitch-eventsub-channel-chat-message-delete.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelChatMessageDeleteNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelChatMessageDelete');
    }

    mapEvent(e: any) {
      return {
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        messageId:              e.messageId,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-message-delete', TwitchEventsubChannelChatMessageDeleteNode);
};
